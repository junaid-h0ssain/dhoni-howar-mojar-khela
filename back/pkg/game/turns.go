package game

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"backend/pkg/models"
)

// IsAdmin reports whether a player is the debug administrator.
// The name must be exactly "ADMINISTRATOR" (all caps, case-sensitive).
func IsAdmin(p *models.Player) bool {
	if p == nil {
		return false
	}
	return strings.TrimSpace(p.Name) == "ADMINISTRATOR"
}

// StartGame moves a LOBBY room into IN_GAME. The caller (room layer) checks
// host identity; the engine checks readiness.
func (e *GameEngine) StartGame() (*Outcome, error) {
	if e.State.Status != models.StatusLobby {
		return nil, errEngine("ALREADY_STARTED", "খেলা ইতিমধ্যে শুরু হয়েছে।")
	}
	if len(e.State.Players) < 2 {
		return nil, errEngine("NOT_ENOUGH_PLAYERS", "খেলার জন্য কমপক্ষে ২ জন খেলোয়াড় দরকার।")
	}
	e.State.Status = models.StatusInGame
	e.State.CurrentTurnPlayerID = e.State.HostID
	e.State.TurnPhase = models.PhaseRoll
	e.doublesCount = 0
	// Fresh entropy per game: a new game must never inherit the deck order
	// dealt at room creation. A dedicated source keeps seeded-test dice
	// streams untouched.
	e.reshuffleDecks(rand.New(rand.NewSource(time.Now().UnixNano())))
	e.AppendLog("খেলা শুরু হয়েছে!")
	return &Outcome{}, nil
}

// RollDice executes a turn's dice roll (§13: valid in ROLL phase, current
// player only). The server generates the dice — clients never send values,
// except the "administrator" debug player, who may supply forced dice via
// RollDiceWithForced.
func (e *GameEngine) RollDice(playerID string) (*Outcome, error) {
	return e.RollDiceWithForced(playerID, nil)
}

// RollDiceWithForced is RollDice with optional admin-chosen dice.
// When forced != nil, the roller must be the administrator and both dice
// must be 1-6; otherwise a random roll is used.
func (e *GameEngine) RollDiceWithForced(playerID string, forced *[2]int) (*Outcome, error) {
	p, err := e.requireTurn(playerID, models.PhaseRoll)
	if err != nil {
		return nil, err
	}
	o := &Outcome{}
	var d1, d2 int
	if forced != nil {
		if !IsAdmin(p) {
			return nil, errEngine("NOT_ADMIN", "শুধু ADMINISTRATOR পাশা নিয়ন্ত্রণ করতে পারবেন।")
		}
		if forced[0] < 1 || forced[0] > 6 || forced[1] < 1 || forced[1] > 6 {
			return nil, errEngine("INVALID_DICE", "পাশার মান ১-৬ এর মধ্যে হতে হবে।")
		}
		d1, d2 = forced[0], forced[1]
	} else {
		d1, d2 = e.nextDice()
	}
	e.State.Dice = [2]int{d1, d2}
	o.Rolled = true
	o.Dice = [2]int{d1, d2}
	// Only double six grants an extra roll. Other matching dice are ordinary rolls.
	o.Doubles = d1 == 6 && d2 == 6
	e.AppendLog(fmt.Sprintf("%s পাশা ফেলেছেন: %d + %d", p.Name, d1, d2))

	if p.InJail {
		e.rollInJail(p, d1, d2, o)
		return o, nil
	}

	total := d1 + d2
	e.movePlayer(p, total, o)
	e.AppendLog(fmt.Sprintf("%s %d ঘর এগিয়েছেন।", p.Name, total))
	e.resolveLanding(p, d1+d2, 0, o)
	if p.IsBankrupt || e.State.Status != models.StatusInGame {
		return o, nil
	}

	if o.SentToJail {
		return o, nil
	}
	if o.Doubles {
		e.doublesCount++
		if e.doublesCount >= 3 {
			e.doublesCount = 0
			e.sendToJail(p, o, "তিনবার জোড়া পাশা ফেলে")
			return o, nil
		}
		// Double six: roll again immediately (buying can wait for a later ACTION).
		e.State.TurnPhase = models.PhaseRoll
		e.AppendLog(fmt.Sprintf("%s জোড়া পেয়েছেন — আবার দান চালুন!", p.Name))
		return o, nil
	}
	e.doublesCount = 0
	// resolveLanding leaves ACTION (act/buy/end) or END_TURN (jailed).
	return o, nil
}

// AutoEndIfNoAction advances a completed roll when the player has no purchase
// available on the tile they stand on. The room calls this after a roll, buy,
// or build, before broadcasting the state.
func (e *GameEngine) AutoEndIfNoAction(playerID string, o *Outcome) {
	if e.State.Status != models.StatusInGame || e.State.CurrentTurnPlayerID != playerID || e.State.TurnPhase != models.PhaseAction {
		return
	}
	p := e.FindPlayer(playerID)
	if p == nil || e.canBuyLandedTile(p) {
		return
	}
	e.AppendLog(fmt.Sprintf("%s-এর আর কোনো কাজ নেই — দান শেষ হয়েছে।", p.Name))
	e.advanceTurn()
	o.TurnAdvanced = true
}

// canBuyLandedTile reports whether the player can buy the tile they stand on.
// Only the landed tile blocks auto-advance: build options elsewhere must not
// hold the turn, because they exist on nearly every late-game turn and would
// stall every landing in ACTION awaiting a manual End Turn. Building stays
// available through the explicit BUILD_HOUSE action.
func (e *GameEngine) canBuyLandedTile(p *models.Player) bool {
	t := e.State.Tiles[p.Position]
	if t == nil || t.OwnerID != "" || p.Cash < t.Price {
		return false
	}
	switch t.Type {
	case models.TileProperty, models.TileUtility, models.TileRailroad:
		return true
	}
	return false
}

// rollInJail handles ROLL_DICE while imprisoned: doubles escape free,
// otherwise the stay counter grows; on the 3rd failed attempt the ৳50 fine
// is auto-paid and the player moves.
func (e *GameEngine) rollInJail(p *models.Player, d1, d2 int, o *Outcome) {
	if d1 == d2 {
		p.InJail = false
		p.JailTurns = 0
		e.doublesCount = 0
		o.FreedFromJail = true
		e.AppendLog(fmt.Sprintf("%s জোড়া ফেলে জেল থেকে মুক্ত হয়েছেন!", p.Name))
		e.movePlayer(p, d1+d2, o)
		e.resolveLanding(p, d1+d2, 0, o)
		return
	}
	p.JailTurns++
	if p.JailTurns >= MaxJailTurns {
		e.AppendLog(fmt.Sprintf("%s জরিমানা ৳%d দিয়ে জেল থেকে বের হচ্ছেন।", p.Name, JailFine))
		if !e.payOrBankrupt(p, JailFine, "bank", "জরিমানার", o) {
			return
		}
		p.InJail = false
		p.JailTurns = 0
		e.doublesCount = 0
		o.FreedFromJail = true
		e.movePlayer(p, d1+d2, o)
		e.AppendLog(fmt.Sprintf("%s %d ঘর এগিয়েছেন।", p.Name, d1+d2))
		e.resolveLanding(p, d1+d2, 0, o)
		return
	}
	e.State.TurnPhase = models.PhaseEndTurn
	e.AppendLog(fmt.Sprintf("%s জেলেই রইলেন (%d/%d)।", p.Name, p.JailTurns, MaxJailTurns))
}

// movePlayer advances around the 40-tile loop, paying GO salary on pass/land.
func (e *GameEngine) movePlayer(p *models.Player, steps int, o *Outcome) {
	from := p.Position
	to := (from + steps) % 40
	o.Moved = true
	o.MovedFrom = from
	o.MovedTo = to
	if from+steps >= 40 {
		p.Cash += GoSalary
		o.PassedGo = true
		e.AppendLog(fmt.Sprintf("%s শুরু ঘর পার হয়ে ৳%d পেয়েছেন।", p.Name, GoSalary))
	}
	p.Position = to
}

// resolveLanding applies the rules of the tile a player stands on.
// diceTotal is the roll that got them there (utility rent). depth guards
// card-chain recursion.
func (e *GameEngine) resolveLanding(p *models.Player, diceTotal, depth int, o *Outcome) {
	t := e.State.Tiles[p.Position]
	if t == nil {
		e.State.TurnPhase = models.PhaseAction
		return
	}
	switch t.Type {
	case models.TileGoToJail:
		e.sendToJail(p, o, "")
	case models.TileTax:
		o.TaxPaid += t.Price
		e.AppendLog(fmt.Sprintf("%s কর দিয়েছেন ৳%d।", p.Name, t.Price))
		if !e.payOrBankrupt(p, t.Price, "bank", "করের", o) {
			return
		}
		e.State.TurnPhase = models.PhaseAction
	case models.TileChance:
		e.drawChance(p, diceTotal, depth, o)
	case models.TileChest:
		e.drawChest(p, diceTotal, depth, o)
	case models.TileProperty, models.TileUtility, models.TileRailroad:
		e.resolveOwnedTile(p, t, diceTotal, o)
	default: // GO, JAIL (visiting), PARKING
		e.State.TurnPhase = models.PhaseAction
	}
}

// EndTurn passes play to the next non-bankrupt player (§13: ACTION/END_TURN).
func (e *GameEngine) EndTurn(playerID string) (*Outcome, error) {
	p, err := e.requireTurn(playerID, models.PhaseAction, models.PhaseEndTurn)
	if err != nil {
		return nil, err
	}
	o := &Outcome{}
	e.AppendLog(fmt.Sprintf("%s দান শেষ করেছেন।", p.Name))
	e.advanceTurn()
	o.TurnAdvanced = true
	return o, nil
}

// ForfeitTurn advances the turn when the current player is gone (reconnect
// timeout policy) so games never stall. Returns true when it advanced.
func (e *GameEngine) ForfeitTurn(playerID string) bool {
	if e.State.Status != models.StatusInGame {
		return false
	}
	if e.State.CurrentTurnPlayerID != playerID {
		return false
	}
	if p := e.FindPlayer(playerID); p != nil && p.IsBankrupt {
		return false // bankruptPlayer already advanced
	}
	e.advanceTurn()
	return true
}
