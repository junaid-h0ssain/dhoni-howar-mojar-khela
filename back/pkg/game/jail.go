package game

import (
	"fmt"

	"backend/pkg/models"
)

// PayJailFine frees an imprisoned player for JailFine, handing them the dice
// (ROLL phase) so they roll and move in the same turn. Failure to cover the
// fine bankrupts through the shared pay path.
func (e *GameEngine) PayJailFine(playerID string) (*Outcome, error) {
	p, err := e.requireTurn(playerID, models.PhaseRoll, models.PhaseAction, models.PhaseEndTurn)
	if err != nil {
		return nil, err
	}
	if !p.InJail {
		return nil, errEngine("NOT_IN_JAIL", "আপনি জেলে নেই।")
	}
	o := &Outcome{}
	e.AppendLog(fmt.Sprintf("%s ৳%d জরিমানা দিয়ে জেল থেকে বের হচ্ছেন।", p.Name, JailFine))
	if !e.payOrBankrupt(p, JailFine, "bank", "জরিমানার", o) {
		return o, nil
	}
	p.InJail = false
	p.JailTurns = 0
	e.doublesCount = 0
	o.FreedFromJail = true
	e.State.TurnPhase = models.PhaseRoll
	return o, nil
}

// UseJailCard spends one holdable get-out-of-jail card (drawn from chance or
// community chest) to walk free, then hands the dice over (ROLL phase).
func (e *GameEngine) UseJailCard(playerID string) (*Outcome, error) {
	p, err := e.requireTurn(playerID, models.PhaseRoll, models.PhaseAction, models.PhaseEndTurn)
	if err != nil {
		return nil, err
	}
	if !p.InJail {
		return nil, errEngine("NOT_IN_JAIL", "আপনি জেলে নেই।")
	}
	if p.JailCards <= 0 {
		return nil, errEngine("NO_JAIL_CARD", "মুক্তির কার্ড নেই। ভাগ্য/সুযোগ থেকে তুলুন।")
	}
	o := &Outcome{}
	p.JailCards--
	p.InJail = false
	p.JailTurns = 0
	e.doublesCount = 0
	o.FreedFromJail = true
	e.State.TurnPhase = models.PhaseRoll
	e.AppendLog(fmt.Sprintf("%s মুক্তির কার্ড দেখিয়ে জেল থেকে বের হলেন! (%dটি বাকি)", p.Name, p.JailCards))
	return o, nil
}
