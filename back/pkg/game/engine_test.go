package game

import (
	"strings"
	"testing"

	"backend/pkg/models"
)

// newStartedEngine builds a deterministic 2-player IN_GAME engine.
// host is current, phase ROLL.
func newStartedEngine(seed int64) (*GameEngine, *models.Player, *models.Player) {
	st := NewGame("TEST01", "")
	e := NewEngineWithSeed(st, seed)
	host, _ := e.AddPlayer("p-host", "রাফি")
	guest, _ := e.AddPlayer("p-guest", "করিম")
	st.HostID = host.ID
	if _, err := e.StartGame(); err != nil {
		panic(err)
	}
	return e, host, guest
}

func mustErrCode(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error %s, got nil", code)
	}
	ee, ok := err.(*EngineError)
	if !ok {
		t.Fatalf("expected EngineError, got %T (%v)", err, err)
	}
	if ee.Code != code {
		t.Fatalf("expected code %s, got %s (%s)", code, ee.Code, ee.Msg)
	}
}

// completeFirstRound marks every seated player as having finished a turn,
// simulating a completed opening round for tests that need buying unlocked.
func completeFirstRound(e *GameEngine) {
	if e.turnsTaken == nil {
		e.turnsTaken = map[string]int{}
	}
	for _, p := range e.State.Players {
		e.turnsTaken[p.ID] = 1
	}
	e.RefreshBuyUnlocked()
}

func TestStartGameValidation(t *testing.T) {
	st := NewGame("R1", "")
	e := NewEngineWithSeed(st, 1)
	if _, err := e.StartGame(); err == nil {
		t.Fatal("expected NOT_ENOUGH_PLAYERS with 0 players")
	}
	_, _ = e.AddPlayer("a", "A")
	if _, err := e.StartGame(); err == nil {
		t.Fatal("expected NOT_ENOUGH_PLAYERS with 1 player")
	}
	mustErrCode(t, mustStartErr(e), "NOT_ENOUGH_PLAYERS")
	_, _ = e.AddPlayer("b", "B")
	st.HostID = "a"
	if _, err := e.StartGame(); err != nil {
		t.Fatalf("start failed: %v", err)
	}
	if st.Status != models.StatusInGame || st.CurrentTurnPlayerID != "a" || st.TurnPhase != models.PhaseRoll {
		t.Fatalf("bad post-start state: %+v", st)
	}
	if _, err := e.StartGame(); err == nil {
		t.Fatal("expected ALREADY_STARTED")
	}
}

func mustStartErr(e *GameEngine) error {
	_, err := e.StartGame()
	return err
}

func TestRollDiceValidation(t *testing.T) {
	e, host, guest := newStartedEngine(2)
	// Wrong player.
	_, err := e.RollDice(guest.ID)
	mustErrCode(t, err, "NOT_YOUR_TURN")
	// Unknown player.
	_, err = e.RollDice("nobody")
	mustErrCode(t, err, "PLAYER_NOT_FOUND")
	// Valid roll moves to ACTION (non-doubles fixed dice).
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if !o.Rolled || !o.Moved || o.MovedTo != 3 {
		t.Fatalf("bad outcome: %+v", o)
	}
	if e.State.TurnPhase != models.PhaseAction {
		t.Fatalf("expected ACTION, got %s", e.State.TurnPhase)
	}
	// Rolling again in ACTION is invalid.
	_, err = e.RollDice(host.ID)
	mustErrCode(t, err, "INVALID_PHASE")
}

func TestPassGoPaysSalary(t *testing.T) {
	e, host, _ := newStartedEngine(3)
	host.Position = 38
	cash := host.Cash
	e.SetFixedDice([][2]int{{1, 2}}) // 38+3=41 -> tile 1, passes GO
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if !o.PassedGo || host.Position != 1 {
		t.Fatalf("bad move: %+v pos=%d", o, host.Position)
	}
	if host.Cash != cash+GoSalary {
		t.Fatalf("expected +%d, cash=%d (was %d)", GoSalary, host.Cash, cash)
	}
}

func TestBuyProperty(t *testing.T) {
	e, host, guest := newStartedEngine(4)
	completeFirstRound(e)
	e.State.TurnPhase = models.PhaseAction
	host.Position = 1
	o, err := e.BuyProperty(host.ID, 1)
	if err != nil {
		t.Fatalf("buy failed: %v", err)
	}
	if !o.Purchased || e.State.Tiles[1].OwnerID != host.ID || host.Cash != StartCash-60 {
		t.Fatalf("bad buy: %+v cash=%d", o, host.Cash)
	}
	// Guest cannot buy host's tile.
	guest.Position = 1
	_, err = e.BuyProperty(host.ID, 1) // sanity: owner re-buy
	mustErrCode(t, err, "ALREADY_OWNED")
	// Not on tile.
	_, err = e.BuyProperty(host.ID, 3)
	mustErrCode(t, err, "NOT_ON_TILE")
	// Not purchasable.
	host.Position = 7
	_, err = e.BuyProperty(host.ID, 7)
	mustErrCode(t, err, "NOT_PURCHASABLE")
	// Insufficient funds.
	host.Position = 39
	host.Cash = 10
	_, err = e.BuyProperty(host.ID, 39)
	mustErrCode(t, err, "INSUFFICIENT_FUNDS")
}

// Buying stays locked until every seated player has finished one turn.
func TestFirstRoundBuyLocked(t *testing.T) {
	e, host, _ := newStartedEngine(200)
	e.State.TurnPhase = models.PhaseAction
	host.Position = 1
	_, err := e.BuyProperty(host.ID, 1)
	mustErrCode(t, err, "ROUND_NOT_COMPLETE")
	if e.State.Tiles[1].OwnerID != "" {
		t.Fatal("locked buy must not transfer ownership")
	}
}

// A played opening round (real EndTurn calls) unlocks buying.
func TestBuyUnlocksAfterFullRound(t *testing.T) {
	e, host, guest := newStartedEngine(201)
	e.State.TurnPhase = models.PhaseAction
	if _, err := e.EndTurn(host.ID); err != nil {
		t.Fatalf("host end: %v", err)
	}
	if e.buyUnlocked() {
		t.Fatal("round must stay locked until every player ends a turn")
	}
	e.State.TurnPhase = models.PhaseAction
	if _, err := e.EndTurn(guest.ID); err != nil {
		t.Fatalf("guest end: %v", err)
	}
	e.RefreshBuyUnlocked()
	if !e.State.BuyUnlocked {
		t.Fatal("buying must unlock after a full round")
	}
	e.State.TurnPhase = models.PhaseAction
	host.Position = 1
	if _, err := e.BuyProperty(host.ID, 1); err != nil {
		t.Fatalf("buy after unlock: %v", err)
	}
	found := false
	for _, line := range e.State.Logs {
		if strings.Contains(line, "প্রথম রাউন্ড শেষ") {
			found = true
		}
	}
	if !found {
		t.Fatal("expected unlock announcement in logs")
	}
}

// A mid-game joiner re-locks buying until they finish their first turn.
func TestMidGameJoinRelocksBuying(t *testing.T) {
	e, _, _ := newStartedEngine(202)
	completeFirstRound(e)
	if !e.buyUnlocked() {
		t.Fatal("expected unlocked after first round")
	}
	if _, err := e.AddPlayer("p-new", "নতুন"); err != nil {
		t.Fatalf("join: %v", err)
	}
	e.RefreshBuyUnlocked()
	if e.buyUnlocked() {
		t.Fatal("new joiner without a turn must re-lock buying")
	}
}

// Landing on a buyable tile during the lock auto-advances (nothing to decide).
func TestAutoEndBuyableTileWhileLocked(t *testing.T) {
	e, host, guest := newStartedEngine(203)
	host.Position = 0 // +3 -> tile 3 (Sitakund, 60, unowned, affordable)
	e.SetFixedDice([][2]int{{1, 2}})
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	e.AutoEndIfNoAction(host.ID, o)
	if !o.TurnAdvanced || e.State.CurrentTurnPlayerID != guest.ID {
		t.Fatalf("locked buyable landing must auto-advance: %+v", o)
	}
}

func TestRentAndFullGroupDouble(t *testing.T) {
	e, host, guest := newStartedEngine(5)
	// Host owns single violet tile 3 (no full group): base rent.
	// Guest reaches tile 3 from 0 with (1,2) — no GO wrap.
	e.State.Tiles[3].OwnerID = host.ID
	base := e.State.Tiles[3].RentTiers[0]
	guest.Position = 0
	e.State.CurrentTurnPlayerID = guest.ID
	hCash, gCash := host.Cash, guest.Cash
	e.SetFixedDice([][2]int{{1, 2}})
	if _, err := e.RollDice(guest.ID); err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if guest.Cash != gCash-base || host.Cash != hCash+base {
		t.Fatalf("single-tile rent wrong: guest %d->%d host %d->%d base=%d",
			gCash, guest.Cash, hCash, host.Cash, base)
	}
	// Full violet group doubles base rent.
	e.State.Tiles[1].OwnerID = host.ID
	if _, err := e.EndTurn(guest.ID); err != nil {
		t.Fatalf("endturn: %v", err)
	}
	e.State.CurrentTurnPlayerID = guest.ID
	e.State.TurnPhase = models.PhaseRoll
	guest.Position = 0
	hCash, gCash = host.Cash, guest.Cash
	e.SetFixedDice([][2]int{{1, 2}})
	if _, err := e.RollDice(guest.ID); err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if guest.Cash != gCash-2*base || host.Cash != hCash+2*base {
		t.Fatalf("full-group rent wrong: guest %d->%d host %d->%d base=%d",
			gCash, guest.Cash, hCash, host.Cash, base)
	}
}

func TestRailroadRent(t *testing.T) {
	for _, tc := range []struct {
		owned int
		rent  int
	}{
		{1, 25}, {2, 50}, {3, 100}, {4, 200},
	} {
		e, host, guest := newStartedEngine(6)
		for i, id := range []int{5, 15, 25, 35} {
			if i < tc.owned {
				e.State.Tiles[id].OwnerID = host.ID
			}
		}
		guest.Position = 3 // roll (1,1)? doubles — use (1,2)=3 -> tile... 3+2=5 railroad
		guest.Position = 2
		e.State.CurrentTurnPlayerID = guest.ID
		gCash := guest.Cash
		e.SetFixedDice([][2]int{{1, 2}}) // 2+3=5 Pahartali
		o, err := e.RollDice(guest.ID)
		if err != nil {
			t.Fatalf("roll failed: %v", err)
		}
		if o.RentPaid != tc.rent || guest.Cash != gCash-tc.rent {
			t.Fatalf("owned=%d: expected rent %d, got %+v cash=%d", tc.owned, tc.rent, o, guest.Cash)
		}
	}
}

func TestUtilityRent(t *testing.T) {
	e, host, guest := newStartedEngine(7)
	e.State.Tiles[12].OwnerID = host.ID // one utility
	guest.Position = 8                 // roll (1,3)=4 -> tile 12
	e.State.CurrentTurnPlayerID = guest.ID
	gCash := guest.Cash
	e.SetFixedDice([][2]int{{1, 3}})
	o, err := e.RollDice(guest.ID)
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if o.RentPaid != 4*4 || guest.Cash != gCash-16 {
		t.Fatalf("single utility: %+v cash=%d", o, guest.Cash)
	}
	// Both utilities -> x10.
	e2, h2, g2 := newStartedEngine(7)
	e2.State.Tiles[12].OwnerID = h2.ID
	e2.State.Tiles[28].OwnerID = h2.ID
	g2.Position = 8
	e2.State.CurrentTurnPlayerID = g2.ID
	gCash = g2.Cash
	e2.SetFixedDice([][2]int{{1, 3}})
	o, err = e2.RollDice(g2.ID)
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if o.RentPaid != 4*10 || g2.Cash != gCash-40 {
		t.Fatalf("double utility: %+v cash=%d", o, g2.Cash)
	}
	_ = host
}

func TestTaxAndBankruptcyToWin(t *testing.T) {
	e, host, guest := newStartedEngine(8)
	_ = guest
	host.Position = 0
	host.Cash = 150 // income tax is 200 -> bankrupt, guest wins
	e.SetFixedDice([][2]int{{1, 3}}) // tile 4 TAX
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if !o.Finished || o.WinnerID != guest.ID {
		t.Fatalf("expected guest win: %+v", o)
	}
	if e.State.Status != models.StatusFinished || !host.IsBankrupt {
		t.Fatalf("bad end state: status=%s bankrupt=%v", e.State.Status, host.IsBankrupt)
	}
	if host.Cash != 0 {
		t.Fatalf("bankrupt cash must be 0, got %d", host.Cash)
	}
}

func TestRentBankruptcyTransfersCashAndProperties(t *testing.T) {
	e, host, guest := newStartedEngine(10)
	tile := e.State.Tiles[1]
	tile.OwnerID = guest.ID
	tile.Houses = 2
	host.Position = 0
	host.Cash = 0
	e.State.CurrentTurnPlayerID = host.ID
	e.SetFixedDice([][2]int{{0, 1}})

	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if !o.Finished || o.WinnerID != guest.ID || !host.IsBankrupt {
		t.Fatalf("expected rent bankruptcy: %+v", o)
	}
	if tile.OwnerID != guest.ID || tile.Houses != 2 {
		t.Fatalf("rent creditor should receive property: %+v", tile)
	}
}

func TestTaxBankruptcyReturnsPropertiesToBank(t *testing.T) {
	e, host, guest := newStartedEngine(11)
	tile := e.State.Tiles[1]
	tile.OwnerID = host.ID
	tile.Houses = 2
	host.Position = 0
	host.Cash = 150
	e.SetFixedDice([][2]int{{1, 3}})

	if _, err := e.RollDice(host.ID); err != nil {
		t.Fatalf("roll failed: %v", err)
	}
	if tile.OwnerID != "" || tile.Houses != 0 || tile.IsMortgaged {
		t.Fatalf("bank should receive tax bankrupt player's property: %+v", tile)
	}
	_ = guest
}

func TestBuildHouseRules(t *testing.T) {
	e, host, guest := newStartedEngine(9)
	e.State.TurnPhase = models.PhaseAction
	// Building is locked until every purchasable tile is sold.
	e.State.Tiles[11].OwnerID = host.ID
	host.Position = 11
	if _, err := e.BuildHouse(host.ID, 11); err == nil {
		t.Fatal("expected BOARD_NOT_SOLD_OUT")
	} else {
		mustErrCode(t, err, "BOARD_NOT_SOLD_OUT")
	}
	// Sell out the board but keep the pink group split: host holds 11,
	// guest holds 13/14 -> still no full group.
	for id, tl := range e.State.Tiles {
		switch tl.Type {
		case models.TileProperty, models.TileUtility, models.TileRailroad:
			if tl.OwnerID == "" {
				if id == 13 || id == 14 {
					tl.OwnerID = guest.ID
				} else {
					tl.OwnerID = host.ID
				}
			}
		}
	}
	e.State.Tiles[13].OwnerID = guest.ID
	e.State.Tiles[14].OwnerID = guest.ID
	// Partial group -> refuse.
	if _, err := e.BuildHouse(host.ID, 11); err == nil {
		t.Fatal("expected NO_FULL_GROUP")
	} else {
		mustErrCode(t, err, "NO_FULL_GROUP")
	}
	// Complete pink group.
	for _, id := range []int{11, 13, 14} {
		e.State.Tiles[id].OwnerID = host.ID
	}
	cost := e.State.Tiles[11].HouseCost
	cash := host.Cash
	if _, err := e.BuildHouse(host.ID, 11); err != nil {
		t.Fatalf("build failed: %v", err)
	}
	if e.State.Tiles[11].Houses != 1 || host.Cash != cash-cost {
		t.Fatalf("bad build: houses=%d cash=%d", e.State.Tiles[11].Houses, host.Cash)
	}
	// Uneven: 11 already has 1, others 0 -> building on 11 again refused.
	if _, err := e.BuildHouse(host.ID, 11); err == nil {
		t.Fatal("expected UNEVEN_BUILD")
	} else {
		mustErrCode(t, err, "UNEVEN_BUILD")
	}
	// Level others, then build up to hotel.
	if _, err := e.BuildHouse(host.ID, 13); err != nil {
		t.Fatalf("build 13: %v", err)
	}
	if _, err := e.BuildHouse(host.ID, 14); err != nil {
		t.Fatalf("build 14: %v", err)
	}
	host.Cash = 100000
	for _, id := range []int{11, 13, 14} {
		for e.State.Tiles[id].Houses < 4 {
			// even-building: always build on a min tile
			minID := id
			for _, cid := range []int{11, 13, 14} {
				if e.State.Tiles[cid].Houses < e.State.Tiles[minID].Houses {
					minID = cid
				}
			}
			if _, err := e.BuildHouse(host.ID, minID); err != nil {
				t.Fatalf("build %d: %v", minID, err)
			}
		}
	}
	if _, err := e.BuildHouse(host.ID, 11); err != nil { // -> hotel
		t.Fatalf("hotel: %v", err)
	}
	if e.State.Tiles[11].Houses != 5 {
		t.Fatalf("expected hotel (5), got %d", e.State.Tiles[11].Houses)
	}
	if _, err := e.BuildHouse(host.ID, 11); err == nil {
		t.Fatal("expected MAX_LEVEL")
	} else {
		mustErrCode(t, err, "MAX_LEVEL")
	}
	// Hotel rent = top tier.
	e.State.Tiles[13].Houses = 5
	rent := e.calculateRent(e.State.Tiles[13], host.ID, 7)
	tiers := e.State.Tiles[13].RentTiers
	if rent != tiers[5] {
		t.Fatalf("hotel rent %d != tiers[5] %d", rent, tiers[5])
	}
}

func TestDoublesRollAgainAndTripleToJail(t *testing.T) {
	e, host, _ := newStartedEngine(10)
	e.SetFixedDice([][2]int{{6, 6}, {6, 6}, {6, 6}})
	o1, err := e.RollDice(host.ID)
	if err != nil || !o1.Doubles || e.State.TurnPhase != models.PhaseRoll {
		t.Fatalf("doubles should re-roll: %+v err=%v phase=%s", o1, err, e.State.TurnPhase)
	}
	o2, err := e.RollDice(host.ID)
	if err != nil || !o2.Doubles || e.State.TurnPhase != models.PhaseRoll {
		t.Fatalf("second doubles should re-roll: %+v err=%v", o2, err)
	}
	o3, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("third roll: %v", err)
	}
	if !o3.SentToJail || !host.InJail || host.Position != 10 {
		t.Fatalf("triple doubles must jail: %+v inJail=%v pos=%d", o3, host.InJail, host.Position)
	}
	if e.State.TurnPhase != models.PhaseEndTurn {
		t.Fatalf("jail must end turn, phase=%s", e.State.TurnPhase)
	}
	// Jailed player cannot buy/build.
	if _, err := e.BuyProperty(host.ID, 10); err == nil {
		t.Fatal("jailed buy should fail")
	}
}

func TestGoToJailTile(t *testing.T) {
	e, host, _ := newStartedEngine(11)
	host.Position = 27
	e.SetFixedDice([][2]int{{1, 2}}) // 27+3=30 GO_TO_JAIL
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if !o.SentToJail || host.Position != 10 || !host.InJail {
		t.Fatalf("must be jailed: %+v pos=%d", o, host.Position)
	}
}

func TestJailEscapeAndFine(t *testing.T) {
	e, host, guest := newStartedEngine(12)
	_ = guest
	// Doubles escape.
	e.sendToJail(host, &Outcome{}, "test")
	e.State.CurrentTurnPlayerID = host.ID
	e.State.TurnPhase = models.PhaseRoll
	host.Position = 10
	e.SetFixedDice([][2]int{{3, 3}})
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if !o.FreedFromJail || host.InJail || !o.Moved {
		t.Fatalf("doubles must free+move: %+v inJail=%v", o, host.InJail)
	}
	// Failed stays: 3 fails -> fine on 3rd.
	e2, h2, g2 := newStartedEngine(13)
	_ = g2
	e2.sendToJail(h2, &Outcome{}, "test")
	e2.State.CurrentTurnPlayerID = h2.ID
	e2.State.TurnPhase = models.PhaseRoll
	h2.Position = 10
	cash := h2.Cash
	e2.SetFixedDice([][2]int{{1, 2}, {2, 3}, {3, 5}})
	for i := 0; i < 2; i++ {
		o, err := e2.RollDice(h2.ID)
		if err != nil {
			t.Fatalf("fail roll %d: %v", i, err)
		}
		if h2.InJail == false || e2.State.TurnPhase != models.PhaseEndTurn {
			t.Fatalf("must stay jailed, turn over: %+v", o)
		}
		if _, err := e2.EndTurn(h2.ID); err != nil {
			t.Fatalf("endturn: %v", err)
		}
		// hand turn back for the test
		e2.State.CurrentTurnPlayerID = h2.ID
		e2.State.TurnPhase = models.PhaseRoll
	}
	o, err = e2.RollDice(h2.ID)
	if err != nil {
		t.Fatalf("3rd roll: %v", err)
	}
	if h2.InJail || !o.FreedFromJail || !o.Moved {
		t.Fatalf("3rd fail must pay fine + move: %+v", o)
	}
	if h2.Cash != cash-JailFine {
		t.Fatalf("fine not paid: %d (was %d)", h2.Cash, cash)
	}
}

func TestEndTurnProgressionAndSkipBankrupt(t *testing.T) {
	st := NewGame("R2", "")
	e := NewEngineWithSeed(st, 14)
	a, _ := e.AddPlayer("a", "A")
	b, _ := e.AddPlayer("b", "B")
	c, _ := e.AddPlayer("c", "C")
	st.HostID = a.ID
	_, _ = e.StartGame()
	st.TurnPhase = models.PhaseAction
	// Wrong player ends turn.
	if _, err := e.EndTurn(b.ID); err == nil {
		t.Fatal("expected NOT_YOUR_TURN")
	} else {
		mustErrCode(t, err, "NOT_YOUR_TURN")
	}
	// Bankrupt B is skipped.
	b.IsBankrupt = true
	o, err := e.EndTurn(a.ID)
	if err != nil || !o.TurnAdvanced {
		t.Fatalf("endturn: %+v %v", o, err)
	}
	if st.CurrentTurnPlayerID != c.ID {
		t.Fatalf("expected C's turn, got %s", st.CurrentTurnPlayerID)
	}
	if st.TurnPhase != models.PhaseRoll {
		t.Fatalf("phase must reset to ROLL, got %s", st.TurnPhase)
	}
	_ = c
}

func TestCardsApplyDirectly(t *testing.T) {
	e, host, _ := newStartedEngine(15)
	o := &Outcome{}
	// Cash gain.
	e.applyCard(host, card{text: "+100", kind: cardCash, amount: 100}, "test", 7, 0, o)
	if host.Cash != StartCash+100 || o.CardDrawn == "" {
		t.Fatalf("cash card: cash=%d outcome=%+v", host.Cash, o)
	}
	// Ruinous bill bankrupts (2 players -> game ends).
	e.applyCard(host, card{text: "-99999", kind: cardCash, amount: -99999}, "test", 7, 0, o)
	if !host.IsBankrupt || !o.Finished {
		t.Fatalf("ruin must bankrupt+finish: bankrupt=%v %+v", host.IsBankrupt, o)
	}
	// Teleport + jail.
	e2, h2, _ := newStartedEngine(16)
	o2 := &Outcome{}
	h2.Position = 35
	e2.applyCard(h2, card{text: "go", kind: cardMoveTo, amount: 5}, "test", 7, 3, o2) // depth 3: no re-resolve
	if h2.Position != 5 || !o2.PassedGo || h2.Cash != StartCash+GoSalary {
		t.Fatalf("moveTo wrap: pos=%d cash=%d %+v", h2.Position, h2.Cash, o2)
	}
	e2.applyCard(h2, card{text: "jail", kind: cardGoToJail}, "test", 7, 0, o2)
	if !h2.InJail || h2.Position != 10 {
		t.Fatalf("card jail: inJail=%v pos=%d", h2.InJail, h2.Position)
	}
}

func TestChanceDrawInvariants(t *testing.T) {
	e, host, _ := newStartedEngine(17)
	host.Position = 0
	e.SetFixedDice([][2]int{{2, 5}}) // tile 7 CHANCE
	o, err := e.RollDice(host.ID)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	if o.CardDrawn == "" {
		t.Fatalf("expected a card draw: %+v", o)
	}
	if host.Cash < 0 || host.Position < 0 || host.Position > 39 {
		t.Fatalf("bad post-card state: cash=%d pos=%d", host.Cash, host.Position)
	}
}

func TestForfeitTurn(t *testing.T) {
	e, host, guest := newStartedEngine(18)
	if e.ForfeitTurn(guest.ID) {
		t.Fatal("must not forfeit another player's turn")
	}
	if !e.ForfeitTurn(host.ID) {
		t.Fatal("must forfeit current player's turn")
	}
	if e.State.CurrentTurnPlayerID != guest.ID {
		t.Fatalf("turn should pass to guest, got %s", e.State.CurrentTurnPlayerID)
	}
}

// TestFullGameSimulation plays seeded 2-player games to completion asserting
// global invariants after every action.
func TestFullGameSimulation(t *testing.T) {
	for _, seed := range []int64{42, 7, 99} {
		st := NewGame("SIM", "")
		e := NewEngineWithSeed(st, seed)
		var ids []string
		for _, n := range []string{"A", "B"} {
			p, _ := e.AddPlayer("p-"+n, n)
			ids = append(ids, p.ID)
		}
		st.HostID = ids[0]
		if _, err := e.StartGame(); err != nil {
			t.Fatal(err)
		}
		steps := 0
		for st.Status == models.StatusInGame && steps < 3000 {
			steps++
			playSimStep(t, e, st)
			checkSimInvariants(t, e, st)
		}
		t.Logf("seed=%d ended after %d steps, status=%s winner=%s", seed, steps, st.Status, st.WinnerID)
		if st.Status == models.StatusInGame {
			t.Fatalf("seed=%d: game did not finish within 3000 steps", seed)
		}
		alive := 0
		for _, p := range st.Players {
			if !p.IsBankrupt {
				alive++
			}
		}
		if alive != 1 {
			t.Fatalf("seed=%d: expected exactly 1 survivor, got %d", seed, alive)
		}
	}
}

// TestFourPlayerStability runs 4-player games asserting invariants only.
// NOTE: without trading, split color groups mean no houses get built and the
// economy inflates instead of terminating (classic no-trade stall — the same
// happens in real Monopoly). Trading/auctions are the follow-up fix; this
// test proves 4-player games stay consistent and never deadlock.
func TestFourPlayerStability(t *testing.T) {
	st := NewGame("SIM4", "")
	e := NewEngineWithSeed(st, 42)
	var ids []string
	for _, n := range []string{"A", "B", "C", "D"} {
		p, _ := e.AddPlayer("p-"+n, n)
		ids = append(ids, p.ID)
	}
	st.HostID = ids[0]
	if _, err := e.StartGame(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2000 && st.Status == models.StatusInGame; i++ {
		playSimStep(t, e, st)
		checkSimInvariants(t, e, st)
	}
}

func playSimStep(t *testing.T, e *GameEngine, st *models.GameState) {
	t.Helper()
	cur := e.FindPlayer(st.CurrentTurnPlayerID)
	if cur == nil {
		t.Fatal("no current player")
	}
	switch st.TurnPhase {
	case models.PhaseRoll:
		if _, err := e.RollDice(cur.ID); err != nil {
			t.Fatalf("roll: %v (phase=%s turn=%s)", err, st.TurnPhase, cur.Name)
		}
	case models.PhaseAction:
		tile := st.Tiles[cur.Position]
		if e.buyUnlocked() && tile != nil && tile.OwnerID == "" && cur.Cash >= tile.Price &&
			(tile.Type == models.TileProperty || tile.Type == models.TileUtility || tile.Type == models.TileRailroad) {
			if _, err := e.BuyProperty(cur.ID, cur.Position); err != nil {
				t.Fatalf("buy: %v", err)
			}
		}
		// Develop everything owned (even-building enforced by engine;
		// errors just mean "not buildable yet").
		for id := 0; id < 40; id++ {
			if tl := st.Tiles[id]; tl.OwnerID == cur.ID && tl.Type == models.TileProperty {
				_, _ = e.BuildHouse(cur.ID, id)
			}
		}
		if _, err := e.EndTurn(cur.ID); err != nil {
			t.Fatalf("endturn: %v", err)
		}
	case models.PhaseEndTurn:
		if _, err := e.EndTurn(cur.ID); err != nil {
			t.Fatalf("endturn2: %v", err)
		}
	}
}

func checkSimInvariants(t *testing.T, e *GameEngine, st *models.GameState) {
	t.Helper()
	for _, p := range st.Players {
		if p.Cash < 0 {
			t.Fatalf("negative cash: %+v", p)
		}
		if p.Position < 0 || p.Position > 39 {
			t.Fatalf("bad position: %+v", p)
		}
	}
	for id, tile := range st.Tiles {
		if tile.Houses < 0 || tile.Houses > 5 {
			t.Fatalf("bad houses on %d: %+v", id, tile)
		}
		if tile.OwnerID != "" && e.FindPlayer(tile.OwnerID) == nil {
			t.Fatalf("orphan owner on %d", id)
		}
	}
}
