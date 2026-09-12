package game

import "testing"

func isPermutation(deck []int, n int) bool {
	if len(deck) != n {
		return false
	}
	seen := make([]bool, n)
	for _, v := range deck {
		if v < 0 || v >= n || seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}

func sameOrder(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func startTwoPlayerGame(t *testing.T, e *GameEngine) {
	t.Helper()
	host, _ := e.AddPlayer("p-h", "A")
	_, _ = e.AddPlayer("p-g", "B")
	e.State.HostID = host.ID
	if _, err := e.StartGame(); err != nil {
		t.Fatal(err)
	}
}

// StartGame must deal fresh, valid decks so no game inherits stale order.
func TestStartGameDealsFreshDecks(t *testing.T) {
	st := NewGame("DECK1", "")
	e := NewEngineWithSeed(st, 123)
	beforeChance := append([]int(nil), e.chanceDeck...)
	beforeChest := append([]int(nil), e.chestDeck...)
	startTwoPlayerGame(t, e)
	if e.chancePos != 0 || e.chestPos != 0 {
		t.Fatalf("draw positions must reset: chance=%d chest=%d", e.chancePos, e.chestPos)
	}
	if !isPermutation(e.chanceDeck, len(chanceCards)) {
		t.Fatalf("chance deck is not a full permutation: %v", e.chanceDeck)
	}
	if !isPermutation(e.chestDeck, len(chestCards)) {
		t.Fatalf("chest deck is not a full permutation: %v", e.chestDeck)
	}
	// Fresh entropy: astronomically unlikely to repeat both orders.
	if sameOrder(beforeChance, e.chanceDeck) && sameOrder(beforeChest, e.chestDeck) {
		t.Fatalf("decks were not reshuffled at game start")
	}
}

// The first card of a game must vary across games (no sticky "always X").
func TestFirstCardVariesAcrossGames(t *testing.T) {
	seen := map[int]bool{}
	for i := 0; i < 50; i++ {
		st := NewGame("DECKVAR", "")
		e := NewEngine(st)
		startTwoPlayerGame(t, e)
		seen[e.chanceDeck[0]] = true
	}
	if len(seen) < 3 {
		t.Fatalf("first chance card barely varies across 50 games: %v", seen)
	}
}
