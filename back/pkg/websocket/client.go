package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"backend/pkg/models"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 8192
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Origin check happens in ServeWS via AllowedOrigins; allow all here
	// so non-browser clients (tests, game clients) can connect.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Client is one connected player socket (§8).
type Client struct {
	hub          *Hub
	room         *Room
	conn         *websocket.Conn
	send         chan []byte
	playerID     string
	sessionToken string
	playerName   string
}

// ServeWS upgrades HTTP to WebSocket and routes CREATE/JOIN to the hub,
// then binds the socket to its room. The first message must be
// CREATE_ROOM / JOIN_ROOM / RECONNECT; JOIN and RECONNECT rehydrate the room
// from its persisted snapshot when a restart dropped it from memory.
func ServeWS(hub *Hub, allowedOrigins map[string]bool, w http.ResponseWriter, r *http.Request) {
	if len(allowedOrigins) > 0 {
		origin := r.Header.Get("Origin")
		if origin != "" && !allowedOrigins[origin] {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &Client{hub: hub, conn: conn, send: make(chan []byte, 64)}

	go c.writePump()
	go c.readPump()
}

// readPump decodes JSON events and forwards them (§8).
func (c *Client) readPump() {
	defer c.cleanup()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// The very first message binds an unbound socket to a room.
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg models.Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.sendError("INVALID_JSON", "ভুল মেসেজ ফরম্যাট।", "")
			continue
		}
		if c.room == nil {
			if !c.bindToRoom(msg) {
				continue
			}
			continue
		}
		c.room.Submit(c, msg)
	}
}

// bindToRoom handles the pre-join CREATE_ROOM / JOIN_ROOM / RECONNECT.
func (c *Client) bindToRoom(msg models.Message) bool {
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
	case models.ActCreateRoom:
		name := str("playerName")
		if name == "" {
			c.sendError("INVALID_NAME", "আপনার নাম দিন।", msg.RequestID)
			return false
		}
		room, host, token, err := c.hub.CreateRoom(name)
		if err != nil {
			c.sendError("CREATE_FAILED", "ঘর তৈরি করা যায়নি।", msg.RequestID)
			return false
		}
		c.room = room
		c.playerID = host.ID
		c.sessionToken = token
		c.playerName = name
		room.attachClient(c)
		c.sendJSON(models.EvRoomCreated, map[string]any{
			"roomId": room.ID, "playerId": host.ID, "sessionToken": token,
		})
		room.emitState()
		return true

	case models.ActJoinRoom:
		room, ok := c.hub.GetOrLoadRoom(str("roomId"))
		if !ok {
			c.sendError("ROOM_NOT_FOUND", "ঘর পাওয়া যায়নি।", msg.RequestID)
			return false
		}
		c.room = room
		c.playerName = str("playerName")
		room.Submit(c, msg) // room goroutine validates + attaches
		return true

	case models.ActReconnect:
		room, ok := c.hub.GetOrLoadRoom(str("roomId"))
		if !ok {
			c.sendError("ROOM_NOT_FOUND", "ঘর পাওয়া যায়নি।", msg.RequestID)
			return false
		}
		c.room = room
		room.Submit(c, msg)
		return true

	default:
		c.sendError("JOIN_FIRST", "আগে ঘর তৈরি করুন বা যোগ দিন।", msg.RequestID)
		return false
	}
}

// writePump sends broadcasts and pings (§8).
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) cleanup() {
	if c.room != nil && c.playerID != "" {
		c.room.handleDisconnect(c)
	}
	close(c.send)
}

func (c *Client) sendJSON(eventType string, payload map[string]any) {
	msg, _ := json.Marshal(models.Message{Type: eventType, Payload: payload})
	select {
	case c.send <- msg:
	default:
		log.Printf("client %s send buffer full, dropping %s", c.playerID, eventType)
	}
}

func (c *Client) sendError(code, message, requestID string) {
	payload := map[string]any{"code": code, "message": message}
	if requestID != "" {
		payload["requestId"] = requestID
	}
	c.sendJSON(models.EvError, payload)
}
