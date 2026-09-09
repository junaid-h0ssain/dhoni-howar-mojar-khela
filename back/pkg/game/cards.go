package game

import (
	"fmt"

	"backend/pkg/models"
)

// Card effects: cash delta, teleport, jail, or step back.
// (No holdable "get out of jail" cards — effects resolve immediately,
// keeping the state model identical to the frontend types.)
type cardKind int

const (
	cardCash cardKind = iota
	cardMoveTo
	cardGoToJail
	cardMoveBack
)

type card struct {
	text   string
	kind   cardKind
	amount int // cash delta (cardCash) or target tile (cardMoveTo) or steps (cardMoveBack)
}

// Chance — ভাগ্য পরীক্ষা.
var chanceCards = []card{
	{text: "শুরুর ঘরে এগিয়ে যান। +৳200", kind: cardMoveTo, amount: 0},
	{text: "জেলে যান।", kind: cardGoToJail},
	{text: "ব্যাংক লভ্যাংশ দিল: +৳100", kind: cardCash, amount: 100},
	{text: "হাসপাতালের বিল: -৳50", kind: cardCash, amount: -50},
	{text: "আগ্রাবাদ যান।", kind: cardMoveTo, amount: 29},
	{text: "পুরস্কার পেলেন: +৳50", kind: cardCash, amount: 50},
	{text: "৩ ঘর পিছিয়ে যান।", kind: cardMoveBack, amount: 3},
	{text: "রাস্তা মেরামত খরচ: -৳100", kind: cardCash, amount: -100},
}

// Community Chest — সুযোগ গ্রহণ.
var chestCards = []card{
	{text: "ব্যাংকের ভুলে +৳200 পেলেন।", kind: cardCash, amount: 200},
	{text: "ডাক্তারের ফি -৳50।", kind: cardCash, amount: -50},
	{text: "ছুটির তহবিল +৳100।", kind: cardCash, amount: 100},
	{text: "জেলে যান।", kind: cardGoToJail},
	{text: "ব্যাংকের সুদ +৳25।", kind: cardCash, amount: 25},
	{text: "স্কুল ফি -৳150।", kind: cardCash, amount: -150},
	{text: "শুরুর ঘরে ফিরুন। +৳200", kind: cardMoveTo, amount: 0},
	{text: "জন্মদিনের উপহার +৳75।", kind: cardCash, amount: 75},
}

func (e *GameEngine) drawChance(p *models.Player, diceTotal, depth int, o *Outcome) {
	c := chanceCards[e.chanceDeck[e.chancePos%len(e.chanceDeck)]]
	e.chancePos++
	e.applyCard(p, c, "ভাগ্য পরীক্ষা", diceTotal, depth, o)
}

func (e *GameEngine) drawChest(p *models.Player, diceTotal, depth int, o *Outcome) {
	c := chestCards[e.chestDeck[e.chestPos%len(e.chestDeck)]]
	e.chestPos++
	e.applyCard(p, c, "সুযোগ গ্রহণ", diceTotal, depth, o)
}

func (e *GameEngine) applyCard(p *models.Player, c card, deck string, diceTotal, depth int, o *Outcome) {
	e.AppendLog(fmt.Sprintf("%s (%s): %s", p.Name, deck, c.text))
	o.CardDrawn = c.text

	switch c.kind {
	case cardCash:
		if c.amount >= 0 {
			p.Cash += c.amount
			e.State.TurnPhase = models.PhaseAction
		} else {
			if !e.payOrBankrupt(p, -c.amount, "bank", "কার্ডের", o) {
				return
			}
			e.State.TurnPhase = models.PhaseAction
		}
	case cardGoToJail:
		e.sendToJail(p, o, "কার্ড তুলে")
	case cardMoveTo:
		from := p.Position
		p.Position = c.amount % 40
		o.Moved = true
		o.MovedFrom = from
		o.MovedTo = p.Position
		if p.Position < from || p.Position == 0 {
			p.Cash += GoSalary
			o.PassedGo = true
			e.AppendLog(fmt.Sprintf("%s শুরু ঘর পার হয়ে ৳%d পেয়েছেন।", p.Name, GoSalary))
		}
		if depth < 3 {
			e.resolveLanding(p, diceTotal, depth+1, o)
		} else {
			e.State.TurnPhase = models.PhaseAction
		}
	case cardMoveBack:
		from := p.Position
		p.Position = (from - c.amount%40 + 40) % 40
		o.Moved = true
		o.MovedFrom = from
		o.MovedTo = p.Position
		if depth < 3 {
			e.resolveLanding(p, diceTotal, depth+1, o)
		} else {
			e.State.TurnPhase = models.PhaseAction
		}
	}
}
