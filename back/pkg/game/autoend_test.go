package game

import (
	"testing"

	"backend/pkg/models"
)

// giveHostLateGame hands the host a full pink group plus cash, mirroring a
// typical late-game owner who can build somewhere on almost every turn.
func giveHostLateGame(e *GameEngine, host *models.Player, cash int) {
	for _, id := range []int{11, 13, 14} {
		e.State.Tiles[id].OwnerID = host.ID
	}
	host.Cash = cash
}

// rollAndAutoEnd mirrors the room layer: ROLL_DICE is always followed by
// AutoEndIfNoAction before the state is broadcast.
func rollAndAutoEnd(e *GameEngine, playerID string) (*Outcome, error) {
	o, err := e.RollDice(playerID)
	if err != nil {
		return nil, err
	}
	e.AutoEndIfNoAction(playerID, o)
	return o, nil
}

func expectAdvanced(t *testing.T, e *GameEngine, o *Outcome, nextID string) {
	t.Helper()
	if !o.TurnAdvanced {
		t.Fatalf("expected auto-advance (phase=%s turn=%s)", e.State.TurnPhase, e.State.CurrentTurnPlayerID)
	}
	if e.State.CurrentTurnPlayerID != nextID {
		t.Fatalf("expected turn to pass to %s, got %s", nextID, e.State.CurrentTurnPlayerID)
	}
	if e.State.TurnPhase != models.PhaseRoll {
		t.Fatalf("expected phase ROLL after advance, got %s", e.State.TurnPhase)
	}
}

// Landing on an idle tile the player cannot buy must auto-advance even when
// they own buildable groups elsewhere (cash 150 < 400 price, but >= 100
// house cost, so the old global build check wrongly held the turn).
func TestAutoEndUnaffordableIdleTileLateGame(t *testing.T) {
	e, host, guest := newStartedEngine(100)
	giveHostLateGame(e, host, 150)
	host.Position = 36 // +3 -> tile 39 (Panchlaish, 400, unowned)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if host.Position != 39 {
		t.Fatalf("expected to land on 39, got %d", host.Position)
	}
	expectAdvanced(t, e, o, guest.ID)
}

// Landing on your own tile is idle: nothing to decide, turn must pass.
func TestAutoEndOwnTileLateGame(t *testing.T) {
	e, host, guest := newStartedEngine(101)
	giveHostLateGame(e, host, 150)
	host.Position = 8 // +3 -> tile 11 (own pink)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	expectAdvanced(t, e, o, guest.ID)
}

// Paying an affordable rent leaves nothing to decide: turn must pass.
func TestAutoEndRentTileLateGame(t *testing.T) {
	e, host, guest := newStartedEngine(102)
	giveHostLateGame(e, host, 150)
	e.State.Tiles[3].OwnerID = guest.ID
	host.Position = 0 // +3 -> tile 3 (guest's violet)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if o.RentPaid <= 0 {
		t.Fatalf("expected rent to be paid: %+v", o)
	}
	expectAdvanced(t, e, o, guest.ID)
}

// Paying tax leaves nothing to decide: turn must pass.
func TestAutoEndTaxTileLateGame(t *testing.T) {
	e, host, guest := newStartedEngine(103)
	giveHostLateGame(e, host, 5000)
	host.Position = 1 // +3 -> tile 4 (Income Tax 200)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if o.TaxPaid != 200 {
		t.Fatalf("expected 200 tax paid: %+v", o)
	}
	expectAdvanced(t, e, o, guest.ID)
}

// Landing on an idle tile the player CAN afford must still hold the turn so
// they can choose to buy — and buying the last action must then auto-advance.
func TestAutoEndHoldsBuyableIdleTile(t *testing.T) {
	e, host, guest := newStartedEngine(104)
	unlockBuying(e)
	host.Cash = 5000
	host.Position = 0 // +3 -> tile 3 (Sitakund, 60, unowned)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if o.TurnAdvanced || e.State.CurrentTurnPlayerID != host.ID {
		t.Fatalf("buyable landing must hold the turn: %+v", o)
	}
	if e.State.TurnPhase != models.PhaseAction {
		t.Fatalf("expected ACTION phase, got %s", e.State.TurnPhase)
	}
	bo, err := e.BuyProperty(host.ID, 3)
	if err != nil {
		t.Fatalf("buy: %v", err)
	}
	e.AutoEndIfNoAction(host.ID, bo)
	expectAdvanced(t, e, bo, guest.ID)
}

// sellOutBoard assigns every purchasable tile, unlocking house building.
func sellOutBoard(e *GameEngine, ownerID string) {
	for _, t := range e.State.Tiles {
		switch t.Type {
		case models.TileProperty, models.TileUtility, models.TileRailroad:
			t.OwnerID = ownerID
		}
	}
}

// After sell-out, landing on an idle tile must HOLD the turn when the player
// has a real build available — otherwise the build UI is unreachable and the
// game stalls with money but nothing to spend it on.
func TestAutoEndHoldsBuildableAfterSellout(t *testing.T) {
	e, host, guest := newStartedEngine(105)
	sellOutBoard(e, guest.ID)
	giveHostLateGame(e, host, 5000) // full pink + cash
	host.Position = 8               // +3 -> tile 11 (own pink)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if o.TurnAdvanced || e.State.CurrentTurnPlayerID != host.ID {
		t.Fatalf("buildable landing must hold the turn: %+v", o)
	}
	if e.State.TurnPhase != models.PhaseAction {
		t.Fatalf("expected ACTION phase, got %s", e.State.TurnPhase)
	}
	if _, err := e.BuildHouse(host.ID, 11); err != nil {
		t.Fatalf("build must succeed in the held window: %v", err)
	}
	if _, err := e.EndTurn(host.ID); err != nil {
		t.Fatalf("endturn: %v", err)
	}
	if e.State.CurrentTurnPlayerID != guest.ID {
		t.Fatalf("turn should pass after manual end, got %s", e.State.CurrentTurnPlayerID)
	}
}

// After sell-out with no full group, there is nothing to build: turn passes.
func TestAutoEndNoGroupAfterSellout(t *testing.T) {
	e, host, guest := newStartedEngine(106)
	sellOutBoard(e, guest.ID)
	e.State.Tiles[11].OwnerID = host.ID // single pink, no group
	host.Cash = 5000
	host.Position = 8 // +3 -> tile 11 (own, unbuildable)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	expectAdvanced(t, e, o, guest.ID)
}

// After sell-out with a full group but no cash, holding the turn is pointless.
func TestAutoEndBrokeAfterSellout(t *testing.T) {
	e, host, guest := newStartedEngine(107)
	sellOutBoard(e, guest.ID)
	giveHostLateGame(e, host, 10) // full pink, can't afford 100 house
	host.Position = 8             // +3 -> tile 11 (own pink)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := rollAndAutoEnd(e, host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	expectAdvanced(t, e, o, guest.ID)
}
