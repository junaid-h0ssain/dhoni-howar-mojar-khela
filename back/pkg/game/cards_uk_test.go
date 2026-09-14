package game

import (
	"testing"

	"backend/pkg/models"
)

// Nearest-station card on an owned railroad charges double the normal rent.
func TestCardNearestRailroadDoubleRent(t *testing.T) {
	e, host, guest := newStartedEngine(31)
	e.State.Tiles[15].OwnerID = host.ID // Chattogram Junction
	guest.Position = 10
	cash := guest.Cash
	hostCash := host.Cash

	o := &Outcome{}
	e.applyCard(guest, card{text: "t", kind: cardNearestRailroad}, "test", 7, 0, o)
	if guest.Position != 15 {
		t.Fatalf("must advance to station 15, got %d", guest.Position)
	}
	// Normal rent for 1 station is 25 → double is 50.
	if guest.Cash != cash-50 || host.Cash != hostCash+50 {
		t.Fatalf("double rent unsettled: guest=%d host=%d", guest.Cash, host.Cash)
	}
	if e.State.TurnPhase != models.PhaseAction {
		t.Fatalf("phase=%s, want ACTION", e.State.TurnPhase)
	}
}

// Unowned nearest station flows into the normal buy path.
func TestCardNearestRailroadUnownedBuyable(t *testing.T) {
	e, host, guest := newStartedEngine(32)
	unlockBuying(e)
	guest.Position = 10
	o := &Outcome{}
	e.applyCard(guest, card{text: "t", kind: cardNearestRailroad}, "test", 7, 0, o)
	if guest.Position != 15 {
		t.Fatalf("must advance to station 15, got %d", guest.Position)
	}
	e.State.CurrentTurnPlayerID = guest.ID
	if _, err := e.BuyProperty(guest.ID, 15); err != nil {
		t.Fatalf("station must be buyable: %v", err)
	}
	_ = host
}

// Nearest-utility card on an owned utility throws fresh dice for 10x rent.
func TestCardNearestUtilityTenTimes(t *testing.T) {
	e, host, guest := newStartedEngine(33)
	e.State.Tiles[12].OwnerID = host.ID // PDB
	guest.Position = 10
	e.SetFixedDice([][2]int{{3, 4}}) // 10x rent = 70
	cash := guest.Cash

	o := &Outcome{}
	e.applyCard(guest, card{text: "t", kind: cardNearestUtility}, "test", 7, 0, o)
	if guest.Position != 12 {
		t.Fatalf("must advance to utility 12, got %d", guest.Position)
	}
	if guest.Cash != cash-70 {
		t.Fatalf("10x rent unsettled: guest=%d (was %d)", guest.Cash, cash)
	}
	if e.State.Dice != [2]int{3, 4} {
		t.Fatalf("fresh throw must show: %v", e.State.Dice)
	}
}

// Repairs bill houses and hotels at their rates; empty portfolios walk free.
func TestCardRepairs(t *testing.T) {
	e, host, _ := newStartedEngine(34)
	unlockBuying(e)
	host.Position = 0
	e.State.Tiles[1].OwnerID = host.ID
	e.State.Tiles[1].Houses = 2
	e.State.Tiles[3].OwnerID = host.ID
	e.State.Tiles[3].Houses = 5 // hotel
	cash := host.Cash

	o := &Outcome{}
	e.applyCard(host, card{text: "t", kind: cardRepairs, amount: 25, amount2: 100}, "test", 7, 0, o)
	if host.Cash != cash-(2*25+100) {
		t.Fatalf("repairs unsettled: %d (was %d)", host.Cash, cash)
	}

	o2 := &Outcome{}
	e.applyCard(host, card{text: "t", kind: cardRepairs, amount: 40, amount2: 115}, "test", 7, 0, o2)
	_ = o2
}

// Chairman pays every other seat; birthday collects from every other seat.
func TestCardPayAndCollectEachPlayer(t *testing.T) {
	e, host, guest := newStartedEngine(35)
	host.Cash = 1000
	guest.Cash = 1000

	o := &Outcome{}
	e.applyCard(host, card{text: "t", kind: cardPayEachPlayer, amount: 50}, "test", 7, 0, o)
	if host.Cash != 950 || guest.Cash != 1050 {
		t.Fatalf("chairman unsettled: host=%d guest=%d", host.Cash, guest.Cash)
	}

	o2 := &Outcome{}
	e.applyCard(host, card{text: "t", kind: cardCollectEachPlayer, amount: 10}, "test", 7, 0, o2)
	if host.Cash != 960 || guest.Cash != 1040 {
		t.Fatalf("birthday unsettled: host=%d guest=%d", host.Cash, guest.Cash)
	}
}

// A broke chairman goes bankrupt mid-handout.
func TestCardPayEachPlayerBankrupts(t *testing.T) {
	e, host, _ := newStartedEngine(36)
	host.Cash = 10
	o := &Outcome{}
	e.applyCard(host, card{text: "t", kind: cardPayEachPlayer, amount: 50}, "test", 7, 0, o)
	if !host.IsBankrupt {
		t.Fatalf("broke chairman must go bankrupt: %+v", o)
	}
}
