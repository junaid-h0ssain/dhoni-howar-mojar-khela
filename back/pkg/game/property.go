package game

import (
	"fmt"

	"backend/pkg/models"
)

// BuyProperty purchases the tile the player stands on (§13: IN_GAME, current
// player, ACTION phase, purchasable, affordable — all re-validated here).
func (e *GameEngine) BuyProperty(playerID string, tileID int) (*Outcome, error) {
	p, err := e.requireTurn(playerID, models.PhaseAction)
	if err != nil {
		return nil, err
	}
	t := e.State.Tiles[tileID]
	if t == nil {
		return nil, errEngine("TILE_NOT_FOUND", "ঘর পাওয়া যায়নি।")
	}
	switch t.Type {
	case models.TileProperty, models.TileUtility, models.TileRailroad:
		// purchasable
	default:
		return nil, errEngine("NOT_PURCHASABLE", "এই ঘর কেনা যায় না।")
	}
	if t.OwnerID != "" {
		return nil, errEngine("ALREADY_OWNED", "এই সম্পত্তি ইতিমধ্যে বিক্রি হয়ে গেছে।")
	}
	if p.Position != tileID {
		return nil, errEngine("NOT_ON_TILE", "শুধু যে ঘরে দাঁড়িয়ে আছেন সেটাই কিনতে পারবেন।")
	}
	if p.Cash < t.Price {
		return nil, errEngine("INSUFFICIENT_FUNDS", "কেনার মতো টাকা নেই।")
	}
	p.Cash -= t.Price
	t.OwnerID = p.ID
	o := &Outcome{Purchased: true, PurchasedTileID: tileID}
	e.AppendLog(fmt.Sprintf("%s %s কিনেছেন ৳%d দিয়ে।", p.Name, t.NameBn, t.Price))
	return o, nil
}

// BuildHouse adds a house (0-3→+1) or hotel (4→5) on a player-owned tile.
// Houses 1-4 build up one level at a time, then the 5th level is a hotel
// (the max). Building unlocks only after every purchasable tile on the
// board is sold. Requires a complete color group, even building across
// the group, and cash.
func (e *GameEngine) BuildHouse(playerID string, tileID int) (*Outcome, error) {
	p, err := e.requireTurn(playerID, models.PhaseAction)
	if err != nil {
		return nil, err
	}
	t := e.State.Tiles[tileID]
	if t == nil {
		return nil, errEngine("TILE_NOT_FOUND", "ঘর পাওয়া যায়নি।")
	}
	if t.Type != models.TileProperty {
		return nil, errEngine("NOT_BUILDABLE", "এখানে বাড়ি তৈরি করা যায় না।")
	}
	if t.OwnerID != p.ID {
		return nil, errEngine("NOT_YOUR_PROPERTY", "এই সম্পত্তি আপনার নয়।")
	}
	if !e.allPropertiesSold() {
		return nil, errEngine("BOARD_NOT_SOLD_OUT", "সব সম্পত্তি বিক্রি হওয়ার আগে বাড়ি/হোটেল তৈরি করা যাবে না।")
	}
	if !e.ownsFullGroup(p.ID, t.Group) {
		return nil, errEngine("NO_FULL_GROUP", "পুরো গ্রুপের মালিক না হলে বাড়ি তৈরি করা যায় না।")
	}
	if t.Houses >= 5 {
		return nil, errEngine("MAX_LEVEL", "এখানে ইতিমধ্যে হোটেল আছে।")
	}
	// Even-building: build on the least-developed tile(s) of the group first.
	min := 5
	for _, u := range e.State.Tiles {
		if u.Type == models.TileProperty && u.Group == t.Group && u.OwnerID == p.ID {
			if u.Houses < min {
				min = u.Houses
			}
		}
	}
	if t.Houses > min {
		return nil, errEngine("UNEVEN_BUILD", "গ্রুপের সব সম্পত্তিতে সমানভাবে বাড়ি তুলুন।")
	}
	if p.Cash < t.HouseCost {
		return nil, errEngine("INSUFFICIENT_FUNDS", "বাড়ি তৈরির টাকা নেই।")
	}
	p.Cash -= t.HouseCost
	t.Houses++
	o := &Outcome{Built: true, BuiltTileID: tileID, BuiltLevel: t.Houses}
	if t.Houses == 5 {
		e.AppendLog(fmt.Sprintf("%s %s-এ হোটেল তৈরি করেছেন!", p.Name, t.NameBn))
	} else {
		e.AppendLog(fmt.Sprintf("%s %s-এ বাড়ি তৈরি করেছেন (%d)।", p.Name, t.NameBn, t.Houses))
	}
	return o, nil
}

// resolveOwnedTile charges rent when landing on an opponent's holding.
func (e *GameEngine) resolveOwnedTile(p *models.Player, t *models.Tile, diceTotal int, o *Outcome) {
	if t.OwnerID == "" || t.OwnerID == p.ID {
		e.State.TurnPhase = models.PhaseAction
		return
	}
	owner := e.FindPlayer(t.OwnerID)
	if owner == nil || owner.IsBankrupt {
		e.State.TurnPhase = models.PhaseAction
		return
	}
	rent := e.calculateRent(t, owner.ID, diceTotal)
	o.RentPaid += rent
	o.RentTo = owner.ID
	e.AppendLog(fmt.Sprintf("%s ভাড়া দিয়েছেন ৳%d (%s)।", p.Name, rent, t.NameBn))
	if !e.payOrBankrupt(p, rent, owner.ID, "ভাড়ার", o) {
		return
	}
	e.State.TurnPhase = models.PhaseAction
}

// calculateRent: properties use tiers (×2 base for unimproved full groups),
// railroads 25/50/100/200 by count owned, utilities dice×4 (×10 if both held).
func (e *GameEngine) calculateRent(t *models.Tile, ownerID string, diceTotal int) int {
	switch t.Type {
	case models.TileRailroad:
		n := e.countOwned(ownerID, "railroad")
		if n < 1 {
			n = 1
		}
		return 25 << (n - 1) // 25, 50, 100, 200
	case models.TileUtility:
		mult := 4
		if e.countOwned(ownerID, "utility") >= 2 {
			mult = 10
		}
		if diceTotal < 2 {
			diceTotal = 7 // card-move fallback: average roll
		}
		return diceTotal * mult
	default: // PROPERTY
		if len(t.RentTiers) == 0 {
			return 0
		}
		if t.Houses > 0 {
			idx := t.Houses
			if idx > 5 {
				idx = 5
			}
			return t.RentTiers[idx]
		}
		if e.ownsFullGroup(ownerID, t.Group) {
			return t.RentTiers[0] * 2
		}
		return t.RentTiers[0]
	}
}
