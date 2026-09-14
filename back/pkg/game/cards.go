package game

import (
	"fmt"

	"backend/pkg/models"
)

// Card effects: cash delta, teleport, jail, step back, nearest
// station/utility advances, repairs, pay/collect-every-player, or a holdable
// get-out-of-jail card kept in the player's inventory until used.
type cardKind int

const (
	cardCash cardKind = iota
	cardMoveTo
	cardGoToJail
	cardMoveBack
	cardGetOutOfJail
	cardNearestRailroad
	cardNearestUtility
	cardRepairs
	cardPayEachPlayer
	cardCollectEachPlayer
)

type card struct {
	text   string
	kind   cardKind
	amount int // cash delta (cardCash) / target tile (cardMoveTo) / steps (cardMoveBack) / per-house rate (cardRepairs) / per-player amount (cardPay/CollectEach)
	// Per-hotel rate (cardRepairs only).
	amount2 int
}

// Chance — ভাগ্য পরীক্ষা (UK deck, Bangla, Taka, Chattogram board).
var chanceCards = []card{
	{text: "যাত্রা শুরুর ঘরে এগিয়ে যান। +৳200", kind: cardMoveTo, amount: 0},
	{text: "দেওয়ানহাট যান। GO পার হলে +৳200", kind: cardMoveTo, amount: 24},
	{text: "পাঁচলাইশ যান।", kind: cardMoveTo, amount: 39},
	{text: "রাউজান যান। GO পার হলে +৳200", kind: cardMoveTo, amount: 11},
	{text: "নিকটতম স্টেশনে যান। কেনা না হলে কিনতে পারবেন, নইলে দ্বিগুণ ভাড়া।", kind: cardNearestRailroad},
	{text: "নিকটতম স্টেশনে যান। কেনা না হলে কিনতে পারবেন, নইলে দ্বিগুণ ভাড়া।", kind: cardNearestRailroad},
	{text: "নিকটতম ইউটিলিটিতে যান। মালিক থাকলে পাশা ফেলে ১০ গুণ ভাড়া দিন।", kind: cardNearestUtility},
	{text: "ব্যাংক লভ্যাংশ দিল: +৳50", kind: cardCash, amount: 50},
	{text: "জেল থেকে মুক্তির কার্ড পেলেন! জেলে গেলে ব্যবহার করুন।", kind: cardGetOutOfJail},
	{text: "৩ ঘর পিছিয়ে যান।", kind: cardMoveBack, amount: 3},
	{text: "জেলে যান। GO পার হবেন না, ৳200 পাবেন না।", kind: cardGoToJail},
	{text: "সাধারণ মেরামত: প্রতি বাড়ি ৳25, প্রতি হোটেল ৳100।", kind: cardRepairs, amount: 25, amount2: 100},
	{text: "দ্রুত চালানোর জরিমানা: -৳15", kind: cardCash, amount: -15},
	{text: "পাহাড়তলী স্টেশনে ভ্রমণ করুন। GO পার হলে +৳200", kind: cardMoveTo, amount: 5},
	{text: "বোর্ডের চেয়ারম্যান হলেন! প্রত্যেক খেলোয়াড়কে ৳50 দিন।", kind: cardPayEachPlayer, amount: 50},
	{text: "বিল্ডিং লোন পরিপক্ক হয়েছে। +৳150", kind: cardCash, amount: 150},
}

// Community Chest — সুযোগ গ্রহণ (UK deck, Bangla, Taka).
var chestCards = []card{
	{text: "যাত্রা শুরুর ঘরে এগিয়ে যান। +৳200", kind: cardMoveTo, amount: 0},
	{text: "ব্যাংকের ভুলে +৳200 পেলেন।", kind: cardCash, amount: 200},
	{text: "ডাক্তারের ফি -৳50।", kind: cardCash, amount: -50},
	{text: "শেয়ার বিক্রি করে +৳50 পেলেন।", kind: cardCash, amount: 50},
	{text: "জেল থেকে মুক্তির কার্ড পেলেন! জেলে গেলে ব্যবহার করুন।", kind: cardGetOutOfJail},
	{text: "জেলে যান। GO পার হবেন না, ৳200 পাবেন না।", kind: cardGoToJail},
	{text: "ছুটির তহবিল +৳100।", kind: cardCash, amount: 100},
	{text: "আয়কর ফেরত +৳20।", kind: cardCash, amount: 20},
	{text: "আপনার জন্মদিন! প্রত্যেক খেলোয়াড়ের কাছ থেকে ৳10 নিন।", kind: cardCollectEachPlayer, amount: 10},
	{text: "জীবনবিমা পরিপক্ক +৳100।", kind: cardCash, amount: 100},
	{text: "হাসপাতালের বিল -৳100।", kind: cardCash, amount: -100},
	{text: "স্কুল ফি -৳50।", kind: cardCash, amount: -50},
	{text: "পরামর্শ ফি +৳25 পেলেন।", kind: cardCash, amount: 25},
	{text: "রাস্তা মেরামত: প্রতি বাড়ি ৳40, প্রতি হোটেল ৳115।", kind: cardRepairs, amount: 40, amount2: 115},
	{text: "সুন্দরী প্রতিযোগিতায় দ্বিতীয় পুরস্কার +৳10।", kind: cardCash, amount: 10},
	{text: "উত্তরাধিকার সূত্রে +৳100 পেলেন।", kind: cardCash, amount: 100},
}

func (e *GameEngine) drawChance(p *models.Player, diceTotal, depth int, o *Outcome) {
	if e.chancePos >= len(e.chanceDeck) {
		e.chanceDeck = shuffledDeck(len(chanceCards), e.rng)
		e.chancePos = 0
	}
	c := chanceCards[e.chanceDeck[e.chancePos]]
	e.chancePos++
	e.applyCard(p, c, "ভাগ্য পরীক্ষা", diceTotal, depth, o)
}

func (e *GameEngine) drawChest(p *models.Player, diceTotal, depth int, o *Outcome) {
	if e.chestPos >= len(e.chestDeck) {
		e.chestDeck = shuffledDeck(len(chestCards), e.rng)
		e.chestPos = 0
	}
	c := chestCards[e.chestDeck[e.chestPos]]
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
	case cardGetOutOfJail:
		p.JailCards++
		e.State.TurnPhase = models.PhaseAction
		e.AppendLog(fmt.Sprintf("%s-এর কাছে মুক্তির কার্ড %dটি।", p.Name, p.JailCards))
	case cardMoveTo:
		e.moveCardTo(p, c.amount, o)
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
	case cardNearestRailroad:
		target := e.nearestTileOfType(p.Position, models.TileRailroad)
		e.moveCardTo(p, target, o)
		if t := e.State.Tiles[target]; e.ownedByOther(t, p) {
			owner := e.FindPlayer(t.OwnerID)
			rent := e.calculateRent(t, owner.ID, diceTotal) * 2
			o.RentPaid += rent
			o.RentTo = owner.ID
			e.AppendLog(fmt.Sprintf("%s দ্বিগুণ ভাড়া দিয়েছেন ৳%d (%s)।", p.Name, rent, t.NameBn))
			if !e.payOrBankrupt(p, rent, owner.ID, "ভাড়ার", o) {
				return
			}
			e.State.TurnPhase = models.PhaseAction
			return
		}
		if depth < 3 {
			e.resolveLanding(p, diceTotal, depth+1, o)
		} else {
			e.State.TurnPhase = models.PhaseAction
		}
	case cardNearestUtility:
		target := e.nearestTileOfType(p.Position, models.TileUtility)
		e.moveCardTo(p, target, o)
		if t := e.State.Tiles[target]; e.ownedByOther(t, p) {
			owner := e.FindPlayer(t.OwnerID)
			d1, d2 := e.nextDice()
			e.State.Dice = [2]int{d1, d2}
			rent := (d1 + d2) * 10
			o.RentPaid += rent
			o.RentTo = owner.ID
			e.AppendLog(fmt.Sprintf("%s পাশা ফেলেছেন: %d + %d — ১০ গুণ ভাড়া ৳%d (%s)।", p.Name, d1, d2, rent, t.NameBn))
			if !e.payOrBankrupt(p, rent, owner.ID, "ভাড়ার", o) {
				return
			}
			e.State.TurnPhase = models.PhaseAction
			return
		}
		if depth < 3 {
			e.resolveLanding(p, diceTotal, depth+1, o)
		} else {
			e.State.TurnPhase = models.PhaseAction
		}
	case cardRepairs:
		houses, hotels := 0, 0
		for _, t := range e.State.Tiles {
			if t.OwnerID == p.ID && t.Type == models.TileProperty {
				if t.Houses >= 5 {
					hotels++
				} else if t.Houses > 0 {
					houses += t.Houses
				}
			}
		}
		total := houses*c.amount + hotels*c.amount2
		if total == 0 {
			e.AppendLog(fmt.Sprintf("%s-এর মেরামতের কিছু নেই।", p.Name))
			e.State.TurnPhase = models.PhaseAction
			return
		}
		e.AppendLog(fmt.Sprintf("%s মেরামত বাবদ ৳%d দিচ্ছেন (%d বাড়ি, %d হোটেল)।", p.Name, total, houses, hotels))
		if !e.payOrBankrupt(p, total, "bank", "মেরামতের", o) {
			return
		}
		e.State.TurnPhase = models.PhaseAction
	case cardPayEachPlayer:
		for _, q := range e.State.Players {
			if q.ID == p.ID || q.IsBankrupt {
				continue
			}
			if !e.payOrBankrupt(p, c.amount, q.ID, "চেয়ারম্যানের", o) {
				return
			}
		}
		e.State.TurnPhase = models.PhaseAction
	case cardCollectEachPlayer:
		for _, q := range e.State.Players {
			if q.ID == p.ID || q.IsBankrupt {
				continue
			}
			// Each payer settles independently; those who can't go bankrupt
			// through the shared path while the rest still pay up.
			e.payOrBankrupt(q, c.amount, p.ID, "জন্মদিনের", o)
		}
		e.State.TurnPhase = models.PhaseAction
	}
}

// moveCardTo teleports a player to a card target, collecting GO salary on a
// pass like cardMoveTo. Unlike dice movement it never counts a board lap.
func (e *GameEngine) moveCardTo(p *models.Player, target int, o *Outcome) {
	from := p.Position
	p.Position = target % 40
	o.Moved = true
	o.MovedFrom = from
	o.MovedTo = p.Position
	if p.Position < from || p.Position == 0 {
		p.Cash += GoSalary
		o.PassedGo = true
		e.AppendLog(fmt.Sprintf("%s যাত্রা শুরু ঘর পার হয়ে ৳%d পেয়েছেন।", p.Name, GoSalary))
	}
}

// nearestTileOfType finds the next tile of a type ahead of from (exclusive).
func (e *GameEngine) nearestTileOfType(from int, typ models.TileType) int {
	for step := 1; step <= 40; step++ {
		id := (from + step) % 40
		if t := e.State.Tiles[id]; t != nil && t.Type == typ {
			return id
		}
	}
	return from
}

// ownedByOther reports whether tile t is a live holding of someone else.
func (e *GameEngine) ownedByOther(t *models.Tile, p *models.Player) bool {
	if t == nil || t.OwnerID == "" || t.OwnerID == p.ID {
		return false
	}
	owner := e.FindPlayer(t.OwnerID)
	return owner != nil && !owner.IsBankrupt
}
