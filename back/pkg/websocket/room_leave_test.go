package websocket

import (
	"context"
	"testing"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"
)

// newStartedTrio builds a started 3-player room: host is current, phase ROLL.
func newStartedTrio() (*Room, *game.GameEngine, *models.Player, *models.Player, *models.Player) {
	hub := NewHub(store.NewMemoryStore())
	st := game.NewGame("ROOM9", "")
	e := game.NewEngineWithSeed(st, 9)
	host, _ := e.AddPlayer("p-host", "Host")
	guest, _ := e.AddPlayer("p-guest", "Guest")
	third, _ := e.AddPlayer("p-third", "Third")
	st.HostID = host.ID
	if _, err := e.StartGame(); err != nil {
		panic(err)
	}
	return NewRoom("ROOM9", e, hub), e, host, guest, third
}

// Leaving the lobby frees the seat, transfers host, and deletes the session.
func TestLeaveRoomLobbyRemovesAndTransfersHost(t *testing.T) {
	hub := NewHub(store.NewMemoryStore())
	st := game.NewGame("LOBBY9", "")
	e := game.NewEngineWithSeed(st, 9)
	host, _ := e.AddPlayer("p-host", "Host")
	guest, _ := e.AddPlayer("p-guest", "Guest")
	st.HostID = host.ID
	r := NewRoom("LOBBY9", e, hub)

	ctx := context.Background()
	_ = hub.sessions.Save(ctx, "tok-host", store.Session{RoomID: r.ID, PlayerID: host.ID}, store.ReconnectTTL)
	hc := &Client{playerID: host.ID, sessionToken: "tok-host", send: make(chan []byte, 64)}
	r.attachClient(hc)

	r.handleAction(hc, models.Message{Type: models.ActLeaveRoom})

	if e.FindPlayer(host.ID) != nil {
		t.Fatal("host seat should be removed from the lobby")
	}
	if st.HostID != guest.ID {
		t.Fatalf("host should transfer to guest, got %s", st.HostID)
	}
	if _, found, _ := hub.sessions.Lookup(ctx, "tok-host"); found {
		t.Fatal("leaver session should be deleted")
	}
	if hc.playerID != "" || hc.sessionToken != "" {
		t.Fatal("client identity should be scrubbed so close is a no-op")
	}
}

// Leaving mid-game returns properties to the bank, passes a stuck turn, and
// the same name + room code can immediately rejoin as a fresh seat.
func TestLeaveRoomInGameFreesSeatAndRejoin(t *testing.T) {
	r, e, host, guest, third := newStartedTrio()
	_ = third
	if e.State.CurrentTurnPlayerID != host.ID {
		t.Fatalf("precondition: host should hold the dice, got %s", e.State.CurrentTurnPlayerID)
	}
	e.State.Tiles[1].OwnerID = host.ID

	ctx := context.Background()
	_ = r.hub.sessions.Save(ctx, "tok-h", store.Session{RoomID: r.ID, PlayerID: host.ID}, store.ReconnectTTL)
	hc := &Client{playerID: host.ID, sessionToken: "tok-h", send: make(chan []byte, 64)}
	r.attachClient(hc)

	r.handleAction(hc, models.Message{Type: models.ActLeaveRoom})

	if e.FindPlayer(host.ID) != nil {
		t.Fatal("leaver seat should be removed mid-game")
	}
	if e.State.Tiles[1].OwnerID != "" {
		t.Fatal("leaver holdings should return to the bank")
	}
	if e.State.CurrentTurnPlayerID != guest.ID {
		t.Fatalf("stuck turn should pass to guest, got %s", e.State.CurrentTurnPlayerID)
	}
	if e.State.Status != models.StatusInGame {
		t.Fatalf("3-player game must continue, status=%s", e.State.Status)
	}
	if e.State.HostID != guest.ID {
		t.Fatalf("host should transfer to guest, got %s", e.State.HostID)
	}

	// Same name + room code rejoins as a brand-new seat.
	jc := &Client{send: make(chan []byte, 64)}
	r.handleAction(jc, models.Message{
		Type:    models.ActJoinRoom,
		Payload: map[string]any{"roomId": r.ID, "playerName": "Host"},
	})
	if jc.playerID == "" || jc.playerID == host.ID {
		t.Fatalf("rejoin should mint a new seat, got %q", jc.playerID)
	}
	if p := e.FindPlayer(jc.playerID); p == nil || p.Name != "Host" {
		t.Fatalf("rejoined player missing: %+v", p)
	}
}

// Leaving without a seat is rejected instead of panicking the event loop.
func TestLeaveRoomWithoutSeatRejected(t *testing.T) {
	r, _, _, _, _ := newStartedTrio()
	c := &Client{send: make(chan []byte, 64)}
	r.handleAction(c, models.Message{Type: models.ActLeaveRoom})
	select {
	case raw := <-c.send:
		if len(raw) == 0 {
			t.Fatal("expected an ERROR event")
		}
	default:
		t.Fatal("expected an ERROR event for seatless LEAVE_ROOM")
	}
}
