package game

import (
	"testing"

	"backend/pkg/models"
)

// Paying the fine walks free immediately and hands the dice over.
func TestPayJailFine(t *testing.T) {
	e, host, _ := newStartedEngine(21)
	e.sendToJail(host, &Outcome{}, "test")
	e.State.CurrentTurnPlayerID = host.ID
	e.State.TurnPhase = models.PhaseRoll
	cash := host.Cash

	o, err := e.PayJailFine(host.ID)
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if host.InJail || !o.FreedFromJail {
		t.Fatalf("must be free: %+v inJail=%v", o, host.InJail)
	}
	if e.State.TurnPhase != models.PhaseRoll {
		t.Fatalf("must hand dice over, phase=%s", e.State.TurnPhase)
	}
	if host.Cash != cash-JailFine {
		t.Fatalf("fine not paid: %d (was %d)", host.Cash, cash)
	}
}

// A broke payer goes bankrupt instead of walking free.
func TestPayJailFineBankrupts(t *testing.T) {
	e, host, _ := newStartedEngine(22)
	e.sendToJail(host, &Outcome{}, "test")
	e.State.CurrentTurnPlayerID = host.ID
	e.State.TurnPhase = models.PhaseRoll
	host.Cash = 10

	o, err := e.PayJailFine(host.ID)
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if !host.IsBankrupt {
		t.Fatalf("broke payer must go bankrupt: %+v", o)
	}
}

// No bail without bars.
func TestPayJailFineNotInJail(t *testing.T) {
	e, host, _ := newStartedEngine(23)
	mustErrCode(t, mustPayErr(e, host.ID), "NOT_IN_JAIL")
}

func mustPayErr(e *GameEngine, id string) error {
	_, err := e.PayJailFine(id)
	return err
}

// A held card is consumed to walk free with the dice handed over.
func TestUseJailCard(t *testing.T) {
	e, host, _ := newStartedEngine(24)
	host.JailCards = 2
	e.sendToJail(host, &Outcome{}, "test")
	e.State.CurrentTurnPlayerID = host.ID
	e.State.TurnPhase = models.PhaseRoll

	o, err := e.UseJailCard(host.ID)
	if err != nil {
		t.Fatalf("use: %v", err)
	}
	if host.InJail || !o.FreedFromJail {
		t.Fatalf("must be free: %+v inJail=%v", o, host.InJail)
	}
	if host.JailCards != 1 {
		t.Fatalf("card must be consumed, left=%d", host.JailCards)
	}
	if e.State.TurnPhase != models.PhaseRoll {
		t.Fatalf("must hand dice over, phase=%s", e.State.TurnPhase)
	}
}

func TestUseJailCardErrors(t *testing.T) {
	e, host, _ := newStartedEngine(25)
	// Not in jail.
	host.JailCards = 1
	_, err := e.UseJailCard(host.ID)
	mustErrCode(t, err, "NOT_IN_JAIL")
	// In jail but no card.
	e.sendToJail(host, &Outcome{}, "test")
	host.JailCards = 0
	_, err = e.UseJailCard(host.ID)
	mustErrCode(t, err, "NO_JAIL_CARD")
}

// Drawing the card grants a holdable instead of resolving immediately.
func TestJailCardDrawGrantsHoldable(t *testing.T) {
	e, host, _ := newStartedEngine(26)
	o := &Outcome{}
	e.applyCard(host, card{text: "test", kind: cardGetOutOfJail}, "test", 7, 0, o)
	if host.JailCards != 1 {
		t.Fatalf("draw must grant a card, got %d", host.JailCards)
	}
	if host.InJail {
		t.Fatal("draw must not jail the drawer")
	}
	if e.State.TurnPhase != models.PhaseAction {
		t.Fatalf("phase=%s, want ACTION", e.State.TurnPhase)
	}
}
