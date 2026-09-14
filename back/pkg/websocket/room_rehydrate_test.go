package websocket

import (
	"context"
	"testing"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"
)

// Restart simulation: a room dropped from memory rehydrates from its snapshot
// with players, dice, and seats intact, and a seat token reclaims its player.
func TestRoomRehydratesFromSnapshot(t *testing.T) {
	hub := NewHub(store.NewMemoryStore())
	st := game.NewGame("9001", "")
	e := game.NewEngineWithSeed(st, 7)
	host, _ := e.AddPlayer("p-host", "Host")
	_, _ = e.AddPlayer("p-guest", "Guest")
	st.HostID = host.ID
	if _, err := e.StartGame(); err != nil {
		t.Fatalf("StartGame: %v", err)
	}
	r := NewRoom("9001", e, hub)
	hc := &Client{playerID: host.ID, send: make(chan []byte, 64)}
	r.attachClient(hc)
	r.handleAction(hc, models.Message{Type: models.ActRollDice})
	wantDice := e.State.Dice

	// Restart: memory wiped, snapshot + session survive.
	hub.RemoveRoom("9001")
	if _, ok := hub.GetRoom("9001"); ok {
		t.Fatal("room should be gone from memory")
	}

	r2, ok := hub.GetOrLoadRoom("9001")
	if !ok {
		t.Fatal("room should rehydrate from snapshot")
	}
	defer r2.quitOnce.Do(func() { close(r2.quit) })
	if len(r2.Engine.State.Players) != 2 {
		t.Fatalf("rehydrated players = %d, want 2", len(r2.Engine.State.Players))
	}
	if r2.Engine.State.Dice != wantDice {
		t.Fatalf("rehydrated dice = %v, want %v", r2.Engine.State.Dice, wantDice)
	}
	if r2.Engine.State.HostID != host.ID {
		t.Fatalf("rehydrated host = %s, want %s", r2.Engine.State.HostID, host.ID)
	}

	// Seat reclaim: a token saved before the restart rebinds the same player.
	const token = "tok-reclaim"
	_ = hub.sessions.Save(context.Background(), token,
		store.Session{RoomID: "9001", PlayerID: host.ID}, store.SessionTTL)
	rc := &Client{send: make(chan []byte, 64)}
	r2.handleAction(rc, models.Message{
		Type:         models.ActReconnect,
		SessionToken: token,
		Payload:      map[string]any{"roomId": "9001", "sessionToken": token},
	})
	if p := r2.Engine.FindPlayer(host.ID); p == nil || !p.IsConnected {
		t.Fatal("host should be reconnected to their seat")
	}
	if rc.playerID != host.ID {
		t.Fatalf("reconnected client playerID = %q, want %q", rc.playerID, host.ID)
	}
}
