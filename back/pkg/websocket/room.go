package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"

	"github.com/google/uuid"
)

func ctxBG() context.Context { return context.Background() }

// inboundAction funnels every state mutation through the room goroutine (§7, §29).
type inboundAction struct {
	client *Client
	msg    models.Message
}

// Room owns one game state + engine (§7).
type Room struct {
	ID     string
	Engine *game.GameEngine
	hub    *Hub

	mu      sync.RWMutex
	clients map[string]*Client // playerID -> client (connected sockets only)

	actions   chan inboundAction
	broadcast chan []byte
	quit      chan struct{}
	quitOnce  sync.Once
}

// NewRoom builds a room; caller must start Run() in its own goroutine.
func NewRoom(id string, engine *game.GameEngine, hub *Hub) *Room {
	return &Room{
		ID:        id,
		Engine:    engine,
		hub:       hub,
		clients:   make(map[string]*Client),
		actions:   make(chan inboundAction, 64),
		broadcast: make(chan []byte, 64),
		quit:      make(chan struct{}),
	}
}

// Run is the room event loop: all state mutations happen here.
func (r *Room) Run() {
	for {
		select {
		case act := <-r.actions:
			r.handleAction(act.client, act.msg)
		case msg := <-r.broadcast:
			r.mu.RLock()
			for _, c := range r.clients {
				select {
				case c.send <- msg:
				default:
					// Slow client: drop instead of blocking the loop.
				}
			}
			r.mu.RUnlock()
		case <-r.quit:
			return
		}
	}
}

// Submit queues a client message for the event loop.
func (r *Room) Submit(c *Client, msg models.Message) {
	// Internal actions (__disconnect__, __reconnect_timeout__) are queued by
	// the room itself — never accept them from sockets, or any client could
	// knock other players offline by spoofing them.
	if len(msg.Type) >= 2 && msg.Type[0] == '_' && msg.Type[1] == '_' {
		c.sendError("UNKNOWN_ACTION", "অজানা অ্যাকশন।", msg.RequestID)
		return
	}
	select {
	case r.actions <- inboundAction{client: c, msg: msg}:
	default:
		c.sendError("SERVER_BUSY", "সার্ভার ব্যস্ত। আবার চেষ্টা করুন।", msg.RequestID)
	}
}

func (r *Room) attachClient(c *Client) {
	r.mu.Lock()
	r.clients[c.playerID] = c
	r.mu.Unlock()
}

func (r *Room) detachClient(c *Client) {
	r.mu.Lock()
	delete(r.clients, c.playerID)
	empty := len(r.clients) == 0
	r.mu.Unlock()
	if empty {
		// Do NOT reap rooms that still hold game state: a reload or a brief
		// network drop leaves zero sockets for a moment, but the 120s
		// reconnect window (§11) must survive it. Route the check through
		// the event loop so Engine access stays race-free.
		select {
		case r.actions <- inboundAction{client: &Client{}, msg: models.Message{
			Type: "__check_empty__",
		}}:
		default:
		}
	}
}

// emit serializes and queues a server event for all clients.
func (r *Room) emit(eventType string, payload map[string]any) {
	msg, _ := json.Marshal(models.Message{Type: eventType, Payload: payload})
	select {
	case r.broadcast <- msg:
	default:
	}
}

// emitState broadcasts the full authoritative state.
func (r *Room) emitState() {
	stateBytes, _ := json.Marshal(r.Engine.State)
	var payload map[string]any
	_ = json.Unmarshal(stateBytes, &payload)
	r.emit(models.EvGameState, payload)
}

func (r *Room) sendTo(c *Client, eventType string, payload map[string]any) {
	msg, _ := json.Marshal(models.Message{Type: eventType, Payload: payload})
	select {
	case c.send <- msg:
	default:
	}
}

// handleAction runs on the room goroutine — the ONLY writer of game state.
func (r *Room) handleAction(c *Client, msg models.Message) {
	payload := msg.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	str := func(key string) string {
		if v, ok := payload[key].(string); ok {
			return v
		}
		return ""
	}

	switch msg.Type {
	case models.ActJoinRoom:
		playerName := str("playerName")
		if playerName == "" {
			c.sendError("INVALID_NAME", "আপনার নাম দিন।", msg.RequestID)
			return
		}
		if r.Engine.State.Status == models.StatusFinished {
			c.sendError("GAME_FINISHED", "খেলা শেষ হয়ে গেছে। নতুন ঘর তৈরি করুন।", msg.RequestID)
			return
		}
		if r.Engine.State.Status != models.StatusLobby && r.Engine.State.Status != models.StatusInGame {
			c.sendError("GAME_ALREADY_STARTED", "এই ঘরে এখন যোগ দেওয়া যাবে না।", msg.RequestID)
			return
		}
		if len(r.Engine.State.Players) >= 10 {
			c.sendError("ROOM_FULL", "ঘর পূর্ণ হয়ে গেছে।", msg.RequestID)
			return
		}
		midGame := r.Engine.State.Status == models.StatusInGame
		playerID := uuid.NewString()
		p, err := r.Engine.AddPlayer(playerID, playerName)
		if err != nil {
			c.sendError("ROOM_FULL", "ঘর পূর্ণ হয়ে গেছে।", msg.RequestID)
			return
		}
		token := uuid.NewString()
		_ = r.hub.sessions.Save(ctxBG(), token,
			store.Session{RoomID: r.ID, PlayerID: playerID}, store.ReconnectTTL)
		c.playerID = playerID
		c.sessionToken = token
		r.attachClient(c)
		if midGame {
			r.Engine.AppendLog(p.Name + " খেলার মাঝে যোগ দিয়েছেন।")
		} else {
			r.Engine.AppendLog(p.Name + " ঘরে যোগ দিয়েছেন।")
		}
		r.sendTo(c, models.EvRoomCreated, map[string]any{
			"roomId": r.ID, "playerId": playerID, "sessionToken": token,
		})
		r.emit(models.EvPlayerJoined, map[string]any{"playerId": playerID, "playerName": playerName})
		r.emitState()

	case models.ActReconnect:
		token := msg.SessionToken
		if s := str("sessionToken"); s != "" {
			token = s
		}
		if token == "" {
			c.sendError("INVALID_SESSION", "সেশন টোকেন পাওয়া যায়নি।", msg.RequestID)
			return
		}
		sess, found, err := r.hub.sessions.Lookup(ctxBG(), token)
		if err != nil || !found || sess.RoomID != r.ID {
			c.sendError("SESSION_EXPIRED", "সেশনের মেয়াদ শেষ। আবার যোগ দিন।", msg.RequestID)
			return
		}
		p := r.Engine.FindPlayer(sess.PlayerID)
		if p == nil {
			c.sendError("PLAYER_NOT_FOUND", "খেলোয়াড় পাওয়া যায়নি।", msg.RequestID)
			return
		}
		p.IsConnected = true
		c.playerID = p.ID
		c.sessionToken = token
		// Sliding window: an active-but-flaky phone that manages to reconnect
		// gets a fresh 120s TTL so it doesn't expire mid-game.
		_ = r.hub.sessions.Save(ctxBG(), token,
			store.Session{RoomID: r.ID, PlayerID: sess.PlayerID}, store.ReconnectTTL)
		r.attachClient(c)
		r.Engine.AppendLog(p.Name + " পুনরায় সংযুক্ত হয়েছেন।")
		r.emit(models.EvPlayerReconnected, map[string]any{"playerId": p.ID})
		r.emitState()

	case models.ActLeaveRoom:
		pid := c.playerID
		if pid == "" {
			c.sendError("NOT_IN_ROOM", "আপনি কোনো ঘরে নেই।", msg.RequestID)
			return
		}
		oldHost := r.Engine.State.HostID
		removed, _, finished, winnerID := r.Engine.RemovePlayer(pid)
		if removed == nil {
			c.sendError("PLAYER_NOT_FOUND", "খেলোয়াড় পাওয়া যায়নি।", msg.RequestID)
			return
		}
		if c.sessionToken != "" {
			_ = r.hub.sessions.Delete(ctxBG(), c.sessionToken)
		}
		// Unbind first (uses the old pid), then scrub identity so the
		// socket's later close is a no-op: the seat is already gone, so no
		// __disconnect__ timeout must be scheduled for it.
		r.detachClient(c)
		c.playerID = ""
		c.sessionToken = ""
		r.Engine.AppendLog(removed.Name + " ঘর ছেড়ে গেছেন।")
		if r.Engine.State.HostID != oldHost {
			if heir := r.Engine.FindPlayer(r.Engine.State.HostID); heir != nil {
				r.Engine.AppendLog(heir.Name + " এখন হোস্ট।")
			}
		}
		r.emit(models.EvPlayerLeft, map[string]any{"playerId": removed.ID})
		if finished {
			r.emit(models.EvGameFinished, map[string]any{"winnerId": winnerID})
		}
		r.emitState()

	case models.ActStartGame:
		if c.playerID != r.Engine.State.HostID {
			c.sendError("NOT_HOST", "শুধু হোস্ট খেলা শুরু করতে পারবেন।", msg.RequestID)
			return
		}
		if _, err := r.Engine.StartGame(); err != nil {
			var ee *game.EngineError
			if errors.As(err, &ee) {
				c.sendError(ee.Code, ee.Msg, msg.RequestID)
			} else {
				c.sendError("START_FAILED", "খেলা শুরু করা যায়নি।", msg.RequestID)
			}
			return
		}
		r.emit(models.EvGameStarted, map[string]any{"roomId": r.ID})
		r.emitState()

	case models.ActSendPing:
		r.sendTo(c, "PONG", map[string]any{})

	default:
		// Full Monopoly actions (ROLL_DICE, BUY_PROPERTY, …) land in Task 3.
		// Try the engine hook first so Task 3 plugs in without touching this file.
		if r.tryEngineAction(c, msg) {
			return
		}
		c.sendError("UNKNOWN_ACTION", "অজানা অ্যাকশন।", msg.RequestID)
	}
}

// handleDisconnect marks the player offline and starts the 120s window (§11).
func (r *Room) handleDisconnect(c *Client) {
	r.detachClient(c)
	if c.playerID == "" {
		return
	}
	// Run the state mutation through the event loop to avoid races.
	// The session token travels in the payload: the timeout that follows
	// runs with no client attached, so the handler cannot read it off c.
	select {
	case r.actions <- inboundAction{client: &Client{}, msg: models.Message{
		Type: "__disconnect__",
		Payload: map[string]any{
			"playerId": c.playerID, "sessionToken": c.sessionToken,
		},
	}}:
		// queued
	case <-time.After(time.Second):
	}
}
