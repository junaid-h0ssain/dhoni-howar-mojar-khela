package game

import (
	"strings"
	"testing"

	"backend/pkg/models"
)

// selloutTargets returns IDs of every purchasable tile (property, utility,
// railroad) — the exact set allPropertiesSold() inspects.
func selloutTargets(e *GameEngine) []int {
	var ids []int
	for id, tl := range e.State.Tiles {
		switch tl.Type {
		case models.TileProperty, models.TileUtility, models.TileRailroad:
			ids = append(ids, id)
		}
	}
	return ids
}

// ownAllExcept assigns every purchasable tile to owner, leaving `except`
// with the bank.
func ownAllExcept(e *GameEngine, ownerID string, except int) {
	for _, id := range selloutTargets(e) {
		if id == except {
			e.State.Tiles[id].OwnerID = ""
		} else {
			e.State.Tiles[id].OwnerID = ownerID
		}
	}
}

func TestSelloutLogOnLastPurchase(t *testing.T) {
	e, host, _ := newStartedEngine(21)
	unlockBuying(e)
	e.State.TurnPhase = models.PhaseAction

	// Find a cheap tile to be the final purchase.
	last := -1
	for _, id := range selloutTargets(e) {
		if last < 0 || e.State.Tiles[id].Price < e.State.Tiles[last].Price {
			last = id
		}
	}
	ownAllExcept(e, host.ID, last)
	host.Cash = 100000
	host.Position = last

	logsBefore := len(e.State.Logs)
	if _, err := e.BuyProperty(host.ID, last); err != nil {
		t.Fatalf("last purchase failed: %v", err)
	}
	if len(e.State.Logs) != logsBefore+2 {
		t.Fatalf("expected purchase log + sellout log, got %d new entries", len(e.State.Logs)-logsBefore)
	}
	if !strings.Contains(e.State.Logs[len(e.State.Logs)-1], "সব সম্পত্তি বিক্রি") {
		t.Fatalf("missing sellout celebration log: %q", e.State.Logs[len(e.State.Logs)-1])
	}
	if !e.allPropertiesSold() {
		t.Fatal("board should report sold out after last purchase")
	}
}

func TestNoSelloutLogBeforeLastPurchase(t *testing.T) {
	e, host, _ := newStartedEngine(22)
	unlockBuying(e)
	e.State.TurnPhase = models.PhaseAction

	ids := selloutTargets(e)
	first, second := ids[0], ids[1]
	ownAllExcept(e, host.ID, second)
	// Keep one more tile unsold so `first` is NOT the last purchase.
	e.State.Tiles[first].OwnerID = ""
	host.Cash = 100000
	host.Position = first

	if _, err := e.BuyProperty(host.ID, first); err != nil {
		t.Fatalf("purchase failed: %v", err)
	}
	last := e.State.Logs[len(e.State.Logs)-1]
	if strings.Contains(last, "সব সম্পত্তি বিক্রি") {
		t.Fatalf("sellout log fired too early: %q", last)
	}
	if e.allPropertiesSold() {
		t.Fatal("board should NOT report sold out with a tile remaining")
	}
}

func TestHotelUpgradeSequence(t *testing.T) {
	e, host, _ := newStartedEngine(23)
	unlockBuying(e)
	e.State.TurnPhase = models.PhaseAction

	// Pink group (11, 13, 14): complete it under host, sell out the rest.
	for _, id := range []int{11, 13, 14} {
		e.State.Tiles[id].OwnerID = host.ID
	}
	ownAllExceptKeep := func() {
		for _, id := range selloutTargets(e) {
			if id == 11 || id == 13 || id == 14 {
				e.State.Tiles[id].OwnerID = host.ID
			} else if e.State.Tiles[id].OwnerID == "" {
				e.State.Tiles[id].OwnerID = host.ID
			}
		}
	}
	ownAllExceptKeep()
	host.Cash = 100000

	// Build 1..4 houses on tile 11 (even-building across the group first).
	group := []int{11, 13, 14}
	for level := 1; level <= 4; level++ {
		// Bring the whole group up to level-1, then raise tile 11.
		for _, id := range group {
			for e.State.Tiles[id].Houses < level-1 {
				if _, err := e.BuildHouse(host.ID, id); err != nil {
					t.Fatalf("setup build %d: %v", id, err)
				}
			}
		}
		for _, id := range group {
			if id == 11 {
				continue
			}
			for e.State.Tiles[id].Houses < level {
				if _, err := e.BuildHouse(host.ID, id); err != nil {
					t.Fatalf("level %d build %d: %v", level, id, err)
				}
			}
		}
		o, err := e.BuildHouse(host.ID, 11)
		if err != nil {
			t.Fatalf("house %d on 11: %v", level, err)
		}
		if !o.Built || o.BuiltTileID != 11 || o.BuiltLevel != level {
			t.Fatalf("bad outcome at level %d: %+v", level, o)
		}
		if e.State.Tiles[11].Houses != level {
			t.Fatalf("expected %d houses, got %d", level, e.State.Tiles[11].Houses)
		}
	}

	// 5th build upgrades 4 houses into a single hotel.
	o, err := e.BuildHouse(host.ID, 11)
	if err != nil {
		t.Fatalf("hotel upgrade failed: %v", err)
	}
	if o.BuiltLevel != 5 || e.State.Tiles[11].Houses != 5 {
		t.Fatalf("expected hotel (5), got outcome=%+v houses=%d", o, e.State.Tiles[11].Houses)
	}
	if last := e.State.Logs[len(e.State.Logs)-1]; !strings.Contains(last, "হোটেল") {
		t.Fatalf("expected hotel log, got %q", last)
	}

	// Hotel is the max: further building refused.
	if _, err := e.BuildHouse(host.ID, 11); err == nil {
		t.Fatal("expected MAX_LEVEL after hotel")
	} else {
		mustErrCode(t, err, "MAX_LEVEL")
	}

	// Hotel charges the top rent tier.
	tl := e.State.Tiles[11]
	if got := e.calculateRent(tl, host.ID, 7); got != tl.RentTiers[5] {
		t.Fatalf("hotel rent %d != tiers[5] %d", got, tl.RentTiers[5])
	}
}

// A lone tile with no group-mates owned still upgrades to a hotel:
// only ownership + sell-out + cash matter.
func TestSingleTileHotelWithoutGroup(t *testing.T) {
	e, host, guest := newStartedEngine(24)
	unlockBuying(e)
	e.State.TurnPhase = models.PhaseAction

	ownAllExcept(e, guest.ID, 11) // guest holds everything but tile 11
	e.State.Tiles[11].OwnerID = host.ID
	host.Cash = 100000

	for level := 1; level <= 5; level++ {
		o, err := e.BuildHouse(host.ID, 11)
		if err != nil {
			t.Fatalf("build %d on lone tile: %v", level, err)
		}
		if o.BuiltLevel != level {
			t.Fatalf("expected level %d, got %+v", level, o)
		}
	}
	if e.State.Tiles[11].Houses != 5 {
		t.Fatalf("expected hotel (5), got %d", e.State.Tiles[11].Houses)
	}
}

// Full group keeps its rent perk: unimproved base rent doubles, while a
// lone tile pays base. (Building no longer requires the group.)
func TestFullGroupDoubleRentBenefit(t *testing.T) {
	e, host, guest := newStartedEngine(25)
	unlockBuying(e)

	// Lone tile: host holds only 11 of the pink group.
	ownAllExcept(e, guest.ID, 11)
	e.State.Tiles[11].OwnerID = host.ID
	lone := e.calculateRent(e.State.Tiles[11], host.ID, 7)
	if lone != e.State.Tiles[11].RentTiers[0] {
		t.Fatalf("lone tile rent %d != base %d", lone, e.State.Tiles[11].RentTiers[0])
	}

	// Full group: host completes pink.
	for _, id := range []int{11, 13, 14} {
		e.State.Tiles[id].OwnerID = host.ID
	}
	full := e.calculateRent(e.State.Tiles[11], host.ID, 7)
	if full != e.State.Tiles[11].RentTiers[0]*2 {
		t.Fatalf("full-group rent %d != double base %d", full, e.State.Tiles[11].RentTiers[0]*2)
	}
}
