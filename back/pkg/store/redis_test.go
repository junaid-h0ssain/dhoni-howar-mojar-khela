package store

import (
	"context"
	"testing"
	"time"
)

// MemoryStore must roundtrip game snapshots with TTL semantics.
func TestMemoryGameSnapshotRoundtrip(t *testing.T) {
	m := NewMemoryStore()
	ctx := context.Background()

	if err := m.SaveGame(ctx, "R1", []byte(`{"roomId":"R1"}`), time.Hour); err != nil {
		t.Fatalf("SaveGame: %v", err)
	}
	data, found, err := m.LoadGame(ctx, "R1")
	if err != nil || !found {
		t.Fatalf("LoadGame: data=%s found=%v err=%v", data, found, err)
	}
	if string(data) != `{"roomId":"R1"}` {
		t.Fatalf("snapshot corrupted: %s", data)
	}
	if exists, _ := m.GameExists(ctx, "R1"); !exists {
		t.Fatal("GameExists should be true after save")
	}

	// Already-expired snapshots vanish instead of resurrecting dead games.
	if err := m.SaveGame(ctx, "R2", []byte(`{}`), -time.Second); err != nil {
		t.Fatalf("SaveGame: %v", err)
	}
	if _, found, _ := m.LoadGame(ctx, "R2"); found {
		t.Fatal("expired snapshot should not load")
	}
	if exists, _ := m.GameExists(ctx, "R2"); exists {
		t.Fatal("expired snapshot should not exist")
	}

	if err := m.DeleteGame(ctx, "R1"); err != nil {
		t.Fatalf("DeleteGame: %v", err)
	}
	if _, found, _ := m.LoadGame(ctx, "R1"); found {
		t.Fatal("deleted snapshot should not load")
	}
}
