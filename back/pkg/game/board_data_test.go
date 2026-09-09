package game

import "testing"

func TestNewBoardHas40Tiles(t *testing.T) {
	b := NewBoard()
	if len(b) != 40 {
		t.Fatalf("expected 40 tiles, got %d", len(b))
	}
	for i := 0; i < 40; i++ {
		if b[i] == nil {
			t.Fatalf("tile %d is missing", i)
		}
		if b[i].ID != i {
			t.Fatalf("tile %d has mismatched ID %d", i, b[i].ID)
		}
	}
}

func TestPropertyGroupCounts(t *testing.T) {
	b := NewBoard()
	counts := map[string]int{}
	for _, tile := range b {
		if tile.Type == "PROPERTY" {
			counts[tile.Group]++
		}
	}
	for group, want := range GroupSizes() {
		if group == "railroad" || group == "utility" {
			continue
		}
		if counts[group] != want {
			t.Fatalf("group %s: expected %d, got %d", group, want, counts[group])
		}
	}
}

func TestSpecialTiles(t *testing.T) {
	b := NewBoard()
	if b[0].Type != "GO" {
		t.Fatal("tile 0 must be GO")
	}
	if b[10].Type != "JAIL" {
		t.Fatal("tile 10 must be JAIL")
	}
	if b[30].Type != "GO_TO_JAIL" {
		t.Fatal("tile 30 must be GO_TO_JAIL")
	}
	if b[20].Type != "PARKING" {
		t.Fatal("tile 20 must be PARKING")
	}
}
