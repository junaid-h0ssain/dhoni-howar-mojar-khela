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

// TestClassicRentTiers pins the classic rent table: [Base, 1H..4H, Hotel]
// per property slot, plus display-only mortgage values.
func TestClassicRentTiers(t *testing.T) {
	b := NewBoard()
	want := map[int]struct {
		rent     []int
		mortgage int
	}{
		1:  {[]int{2, 10, 30, 90, 160, 250}, 30},
		3:  {[]int{4, 20, 60, 180, 320, 450}, 30},
		6:  {[]int{6, 30, 90, 270, 400, 550}, 50},
		8:  {[]int{6, 30, 90, 270, 400, 550}, 50},
		9:  {[]int{8, 40, 100, 300, 450, 600}, 60},
		11: {[]int{10, 50, 150, 450, 625, 750}, 70},
		13: {[]int{10, 50, 150, 450, 625, 750}, 70},
		14: {[]int{12, 60, 180, 500, 700, 900}, 80},
		16: {[]int{14, 70, 200, 550, 750, 950}, 90},
		18: {[]int{14, 70, 200, 550, 750, 950}, 90},
		19: {[]int{16, 80, 220, 600, 800, 1000}, 100},
		21: {[]int{18, 90, 250, 700, 875, 1050}, 110},
		23: {[]int{18, 90, 250, 700, 875, 1050}, 110},
		24: {[]int{20, 100, 300, 750, 925, 1100}, 70},
		26: {[]int{22, 110, 330, 800, 975, 1150}, 130},
		27: {[]int{22, 110, 330, 800, 975, 1150}, 130},
		29: {[]int{24, 120, 360, 850, 1025, 1200}, 140},
		31: {[]int{26, 130, 390, 900, 1100, 1275}, 150},
		32: {[]int{26, 130, 390, 900, 1100, 1275}, 150},
		34: {[]int{28, 150, 450, 1000, 1200, 1400}, 160},
		37: {[]int{35, 175, 500, 1100, 1300, 1500}, 175},
		39: {[]int{50, 200, 600, 1400, 1700, 2000}, 200},
	}
	for id, w := range want {
		tl := b[id]
		if len(tl.RentTiers) != 6 {
			t.Fatalf("tile %d: expected 6 rent tiers, got %v", id, tl.RentTiers)
		}
		for i, r := range w.rent {
			if tl.RentTiers[i] != r {
				t.Fatalf("tile %d tier %d: expected %d, got %d", id, i, r, tl.RentTiers[i])
			}
		}
		if tl.Mortgage != w.mortgage {
			t.Fatalf("tile %d mortgage: expected %d, got %d", id, w.mortgage, tl.Mortgage)
		}
	}
	for _, id := range []int{5, 15, 25, 35} {
		if b[id].Mortgage != 100 {
			t.Fatalf("railroad %d mortgage: expected 100, got %d", id, b[id].Mortgage)
		}
	}
	for _, id := range []int{12, 28} {
		if b[id].Mortgage != 75 {
			t.Fatalf("utility %d mortgage: expected 75, got %d", id, b[id].Mortgage)
		}
	}
}
