package websocket

import (
	"context"
	"testing"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"
)

// newAutoAdvRoom builds a started 2-player room: host is current, phase ROLL.
func newAutoAdvRoom() (*Room, *game.GameEngine, *models.Player, *models.Player) {
	hub := NewHub(store.NewMemoryStore())
	st := game.NewGame("ROOM1", "")
	e := game.NewEngineWithSeed(st, 1)
	host, _ := e.AddPlayer("p-host", "Host")
	guest, _ := e.AddPlayer("p-guest", "Guest")
	st.HostID = host.ID
	if _, err := e.StartGame(); err != nil {
		panic(err)
	}
	return NewRoom("ROOM1", e, hub), e, host, guest
}

// TestReconnectTimeoutNilClient reproduces the late-game room freeze: after a
// disconnect, the 120s timeout action is queued WITHOUT a client, and the
// handler dereferences it (c.sessionToken) — panicking the room goroutine so
// no further turns can advance.
func TestReconnectTimeoutNilClient(t *testing.T) {
	r, e, host, guest := newAutoAdvRoom()
	_ = guest

	// Host (current turn) drops: mark offline exactly like the event loop does,
	// carrying the session token the same way handleDisconnect does.
	const token = "tok-host-1"
	_ = r.hub.sessions.Save(context.Background(), token,
		store.Session{RoomID: r.ID, PlayerID: host.ID}, store.ReconnectTTL)
	r.handleAction(&Client{}, models.Message{
		Type: "__disconnect__",
		Payload: map[string]any{
			"playerId": host.ID, "sessionToken": token,
		},
	})
	if host.IsConnected {
		t.Fatal("host should be marked disconnected")
	}

	// 120s later the timeout goroutine fires with a nil client.
	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("room event loop panicked on __reconnect_timeout__ with nil client: %v", rec)
		}
	}()
	r.handleAction(nil, models.Message{
		Type: "__reconnect_timeout__",
		Payload: map[string]any{
			"playerId": host.ID, "sessionToken": token,
		},
	})

	// The stuck turn must auto-advance to the guest instead of bricking the room.
	if e.State.CurrentTurnPlayerID != guest.ID {
		t.Fatalf("turn should forfeit to guest, got %s", e.State.CurrentTurnPlayerID)
	}
	// The seat token must SURVIVE the gameplay timeout (24h session): the
	// player object stays in the game so a late returner reclaims their seat.
	if _, found, _ := r.hub.sessions.Lookup(context.Background(), token); !found {
		t.Fatal("host session should be retained for late reclaim")
	}
	if e.FindPlayer(host.ID) == nil {
		t.Fatal("host player object should stay in the game for late reclaim")
	}
}

// TestInternalActionsRejectedFromClients ensures a client cannot spoof the
// internal __disconnect__/__reconnect_timeout__ actions to knock out others.
func TestInternalActionsRejectedFromClients(t *testing.T) {
	r, _, host, _ := newAutoAdvRoom()
	c := &Client{playerID: "p-guest", send: make(chan []byte, 64)}
	r.Submit(c, models.Message{
		Type: "__disconnect__", Payload: map[string]any{"playerId": host.ID},
	})
	// Drain: Submit must NOT have queued anything (would be a queued action).
	select {
	case act := <-r.actions:
		t.Fatalf("internal action accepted from client: %+v", act.msg)
	default:
	}
	if !host.IsConnected {
		t.Fatal("spoofed __disconnect__ knocked the host offline")
	}
}
