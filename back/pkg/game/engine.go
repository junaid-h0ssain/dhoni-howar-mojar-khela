package game

import (
	"errors"
	"fmt"
	"math/rand"
	"time"

	"backend/pkg/models"
)

// Tunables (classic Monopoly values, in Taka).
const (
	StartCash    = 1500
	GoSalary     = 200
	JailFine     = 50
	MaxJailTurns = 3
)

// EngineError is a rule rejection with a client-facing code + Bangla message.
// The websocket layer maps Code straight into an ERROR event (§10).
type EngineError struct {
	Code string
	Msg  string
}

func (e *EngineError) Error() string { return e.Code + ": " + e.Msg }

func errEngine(code, msg string) *EngineError { return &EngineError{Code: code, Msg: msg} }

// Outcome describes everything one engine call changed, so the websocket
// layer can emit granular events (DICE_ROLLED, PLAYER_MOVED, …) before
// broadcasting the full GAME_STATE.
type Outcome struct {
	Rolled      bool
	Dice        [2]int
	Doubles     bool
	Moved       bool
	MovedFrom   int
	MovedTo     int
	PassedGo    bool
	SentToJail  bool
	FreedFromJail bool

	RentPaid int
	RentTo   string
	TaxPaid  int
	CardDrawn string

	Purchased       bool
	PurchasedTileID int
	Built           bool
	BuiltTileID     int
	BuiltLevel      int

	Bankrupted   []string
	TurnAdvanced bool
	Finished     bool
	WinnerID     string
}

// GameEngine owns all Monopoly-style rules (§12). It is NOT goroutine-safe;
// callers must serialize access (the Room event loop does this, §29).
type GameEngine struct {
	State *models.GameState

	rng          *rand.Rand
	doublesCount int
	chanceDeck   []int
	chestDeck    []int
	chancePos    int
	chestPos     int
	// fixedDice queues exact rolls consumed before the RNG (tests only).
	fixedDice [][2]int
}

// NewEngine wraps state with a time-seeded RNG and shuffled card decks.
func NewEngine(state *models.GameState) *GameEngine {
	return NewEngineWithSeed(state, time.Now().UnixNano())
}

// NewEngineWithSeed is the deterministic constructor for tests.
func NewEngineWithSeed(state *models.GameState, seed int64) *GameEngine {
	e := &GameEngine{State: state, rng: rand.New(rand.NewSource(seed))}
	e.chanceDeck = shuffledDeck(len(chanceCards), e.rng)
	e.chestDeck = shuffledDeck(len(chestCards), e.rng)
	return e
}

func shuffledDeck(n int, rng *rand.Rand) []int {
	d := make([]int, n)
	for i := range d {
		d[i] = i
	}
	rng.Shuffle(n, func(i, j int) { d[i], d[j] = d[j], d[i] })
	return d
}

// SetFixedDice queues exact dice rolls consumed before the RNG.
// Test-only helper for deterministic rule tests.
func (e *GameEngine) SetFixedDice(d [][2]int) { e.fixedDice = d }

func (e *GameEngine) nextDice() (int, int) {
	if len(e.fixedDice) > 0 {
		d := e.fixedDice[0]
		e.fixedDice = e.fixedDice[1:]
		return d[0], d[1]
	}
	return 1 + e.rng.Intn(6), 1 + e.rng.Intn(6)
}

// NewGame creates a fresh LOBBY state for a room.
func NewGame(roomID, hostID string) *models.GameState {
	return &models.GameState{
		RoomID:    roomID,
		HostID:    hostID,
		Status:    models.StatusLobby,
		TurnPhase: models.PhaseRoll,
		Tiles:     NewBoard(),
		Players:   []*models.Player{},
		Logs:      []string{},
	}
}

// TokenColors cycles for up to 10 players.
var TokenColors = []string{
	"#22c55e", "#3b82f6", "#ef4444", "#eab308", "#a855f7",
	"#f97316", "#14b8c4", "#ec4899", "#84cc16", "#6b7280",
}

// AddPlayer appends a player; returns error when the room is full.
func (e *GameEngine) AddPlayer(id, name string) (*models.Player, error) {
	if len(e.State.Players) >= 10 {
		return nil, errors.New("room is full (max 10 players)")
	}
	p := &models.Player{
		ID:          id,
		Name:        name,
		TokenColor:  TokenColors[len(e.State.Players)%len(TokenColors)],
		Cash:        StartCash,
		Position:    0,
		IsConnected: true,
	}
	e.State.Players = append(e.State.Players, p)
	return p, nil
}

// FindPlayer returns the player pointer or nil.
func (e *GameEngine) FindPlayer(id string) *models.Player {
	for _, p := range e.State.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

// AppendLog keeps the last 100 entries (frontend shows latest).
func (e *GameEngine) AppendLog(entry string) {
	e.State.Logs = append(e.State.Logs, entry)
	if len(e.State.Logs) > 100 {
		e.State.Logs = e.State.Logs[len(e.State.Logs)-100:]
	}
}

// alivePlayers returns non-bankrupt players in seating order.
func (e *GameEngine) alivePlayers() []*models.Player {
	var out []*models.Player
	for _, p := range e.State.Players {
		if !p.IsBankrupt {
			out = append(out, p)
		}
	}
	return out
}

// advanceTurn moves to the next non-bankrupt player and resets turn state.
func (e *GameEngine) advanceTurn() {
	alive := e.alivePlayers()
	if len(alive) == 0 {
		return
	}
	idx := -1
	for i, p := range e.State.Players {
		if p.ID == e.State.CurrentTurnPlayerID {
			idx = i
			break
		}
	}
	for step := 1; step <= len(e.State.Players); step++ {
		next := e.State.Players[(idx+step+len(e.State.Players))%len(e.State.Players)]
		if !next.IsBankrupt {
			e.State.CurrentTurnPlayerID = next.ID
			break
		}
	}
	e.State.TurnPhase = models.PhaseRoll
	e.doublesCount = 0
}

// payOrBankrupt transfers amount from payer to creditorID ("bank" = the bank).
// If payer cannot cover it, they go bankrupt: the creditor receives whatever
// cash remains, properties return to the bank, and the win condition is
// checked. Returns true when the payment was made in full.
func (e *GameEngine) payOrBankrupt(payer *models.Player, amount int, creditorID, reason string, o *Outcome) bool {
	if amount <= 0 {
		return true
	}
	if payer.Cash >= amount {
		payer.Cash -= amount
		if creditorID != "bank" {
			if c := e.FindPlayer(creditorID); c != nil && !c.IsBankrupt {
				c.Cash += amount
			}
		}
		return true
	}
	// Bankruptcy: creditor gets the remainder.
	remainder := payer.Cash
	payer.Cash = 0
	if creditorID != "bank" {
		if c := e.FindPlayer(creditorID); c != nil && !c.IsBankrupt {
			c.Cash += remainder
		}
	}
	e.AppendLog(fmt.Sprintf("%s %s ৳%d দিতে না পেরে দেউলিয়া হয়ে গেছেন।", payer.Name, reason, amount))
	e.bankruptPlayer(payer, o)
	return false
}

// bankruptPlayer releases holdings, marks bankruptcy, and advances/finishes.
func (e *GameEngine) bankruptPlayer(p *models.Player, o *Outcome) {
	p.IsBankrupt = true
	for _, t := range e.State.Tiles {
		if t.OwnerID == p.ID {
			t.OwnerID = ""
			t.Houses = 0
			t.IsMortgaged = false
		}
	}
	o.Bankrupted = append(o.Bankrupted, p.ID)
	if e.checkWin(o) {
		return
	}
	if e.State.CurrentTurnPlayerID == p.ID {
		e.advanceTurn()
		o.TurnAdvanced = true
	}
}

// checkWin finishes the game when one non-bankrupt player remains.
func (e *GameEngine) checkWin(o *Outcome) bool {
	if e.State.Status != models.StatusInGame {
		return false
	}
	alive := e.alivePlayers()
	if len(alive) == 1 {
		e.State.Status = models.StatusFinished
		e.State.WinnerID = alive[0].ID
		e.AppendLog(fmt.Sprintf("🏆 বিজয়ী: %s!", alive[0].Name))
		o.Finished = true
		o.WinnerID = alive[0].ID
		return true
	}
	return false
}

// sendToJail moves a player to Jail (tile 10), forfeiting the turn.
func (e *GameEngine) sendToJail(p *models.Player, o *Outcome, reason string) {
	p.Position = 10
	p.InJail = true
	p.JailTurns = 0
	e.doublesCount = 0
	e.State.TurnPhase = models.PhaseEndTurn
	o.SentToJail = true
	e.AppendLog(fmt.Sprintf("%s %s জেলে গেছেন।", p.Name, reason))
}

// ownsFullGroup reports whether playerID owns every PROPERTY tile of group.
func (e *GameEngine) ownsFullGroup(playerID, group string) bool {
	want, ok := GroupSizes()[group]
	if !ok || group == "railroad" || group == "utility" {
		return false
	}
	got := 0
	for _, t := range e.State.Tiles {
		if t.Type == models.TileProperty && t.Group == group {
			if t.OwnerID != playerID {
				return false
			}
			got++
		}
	}
	return got == want && want > 0
}

// countOwned counts tiles of a group owned by playerID.
func (e *GameEngine) countOwned(playerID, group string) int {
	n := 0
	for _, t := range e.State.Tiles {
		if t.OwnerID == playerID && t.Group == group {
			n++
		}
	}
	return n
}

// requireTurn validates status, identity, and phase for acting players.
func (e *GameEngine) requireTurn(playerID string, phases ...models.TurnPhase) (*models.Player, error) {
	if e.State.Status != models.StatusInGame {
		return nil, errEngine("NOT_IN_GAME", "খেলা এখন চলছে না।")
	}
	p := e.FindPlayer(playerID)
	if p == nil {
		return nil, errEngine("PLAYER_NOT_FOUND", "খেলোয়াড় পাওয়া যায়নি।")
	}
	if p.IsBankrupt {
		return nil, errEngine("BANKRUPT", "আপনি দেউলিয়া হয়ে গেছেন।")
	}
	if e.State.CurrentTurnPlayerID != playerID {
		return nil, errEngine("NOT_YOUR_TURN", "এখন আপনার চাল নয়।")
	}
	for _, ph := range phases {
		if e.State.TurnPhase == ph {
			return p, nil
		}
	}
	return nil, errEngine("INVALID_PHASE", "এই চাল এখন দেওয়া যাবে না।")
}
