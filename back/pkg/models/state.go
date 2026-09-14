package models

// TileType mirrors the TypeScript TileType union.
type TileType string

const (
	TileProperty TileType = "PROPERTY"
	TileUtility  TileType = "UTILITY"
	TileRailroad TileType = "RAILROAD"
	TileChance   TileType = "CHANCE"
	TileChest    TileType = "CHEST"
	TileTax      TileType = "TAX"
	TileJail     TileType = "JAIL"
	TileGoToJail TileType = "GO_TO_JAIL"
	TileGo       TileType = "GO"
	TileParking  TileType = "PARKING"
)

// Tile is a single board square. IDs are 0-39.
type Tile struct {
	ID         int      `json:"id"`
	NameBn     string   `json:"nameBn"`
	NameEn     string   `json:"nameEn"`
	Type       TileType `json:"type"`
	Price      int      `json:"price,omitempty"`
	RentTiers  []int    `json:"rentTiers,omitempty"` // [Base, 1H, 2H, 3H, 4H, Hotel]
	HouseCost  int      `json:"houseCost,omitempty"`
	// Mortgage is display-only info (no mortgage feature exists).
	Mortgage   int      `json:"mortgage,omitempty"`
	Group      string   `json:"group,omitempty"`
	OwnerID    string   `json:"ownerId,omitempty"`
	Houses     int      `json:"houses"` // 0-4 houses, 5 = hotel
	IsMortgaged bool    `json:"isMortgaged"`
}

// Player is a single participant.
type Player struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	TokenColor  string `json:"tokenColor"`
	Cash        int    `json:"cash"`
	Position    int    `json:"position"` // 0-39
	InJail      bool   `json:"inJail"`
	JailTurns   int    `json:"jailTurns"`
	// JailCards counts holdable get-out-of-jail cards (chance/chest).
	JailCards   int    `json:"jailCards"`
	IsBankrupt  bool   `json:"isBankrupt"`
	IsConnected bool   `json:"isConnected"`
	// LapsCompleted counts full board circuits (passing GO) via dice
	// movement. Buying unlocks per player after their first lap.
	LapsCompleted int `json:"lapsCompleted"`
}

// GameStatus is the room lifecycle state.
type GameStatus string

const (
	StatusLobby    GameStatus = "LOBBY"
	StatusInGame   GameStatus = "IN_GAME"
	StatusFinished GameStatus = "FINISHED"
)

// TurnPhase is the per-turn lifecycle state.
type TurnPhase string

const (
	PhaseRoll    TurnPhase = "ROLL"
	PhaseAction  TurnPhase = "ACTION"
	PhaseEndTurn TurnPhase = "END_TURN"
)

// GameState is the authoritative server-side state.
// It mirrors the TypeScript GameState interface.
type GameState struct {
	RoomID              string          `json:"roomId"`
	HostID              string          `json:"hostId"`
	Status              GameStatus      `json:"status"`
	CurrentTurnPlayerID string          `json:"currentTurnPlayerId"`
	Dice                [2]int          `json:"dice"`
	TurnPhase           TurnPhase       `json:"turnPhase"`
	Tiles               map[int]*Tile   `json:"tiles"`
	Players             []*Player       `json:"players"`
	Logs                []string        `json:"logs"`
	WinnerID            string          `json:"winnerId,omitempty"`
}

// Message is a generic client <-> server envelope.
type Message struct {
	Type         string         `json:"type"`
	Payload      map[string]any `json:"payload,omitempty"`
	RequestID    string         `json:"requestId,omitempty"`
	PlayerID     string         `json:"playerId,omitempty"`
	SessionToken string         `json:"sessionToken,omitempty"`
}

// ServerEvent types sent from server to clients. Clients render purely from
// GAME_STATE — no granular animation events exist by design.
const (
	EvRoomCreated = "ROOM_CREATED"
	EvGameState   = "GAME_STATE"
	EvError       = "ERROR"
)

// ClientAction types accepted from clients.
const (
	ActCreateRoom  = "CREATE_ROOM"
	ActJoinRoom    = "JOIN_ROOM"
	ActReconnect   = "RECONNECT"
	ActLeaveRoom   = "LEAVE_ROOM"
	ActStartGame   = "START_GAME"
	ActRollDice    = "ROLL_DICE"
	ActBuyProperty = "BUY_PROPERTY"
	ActBuildHouse  = "BUILD_HOUSE"
	ActEndTurn     = "END_TURN"
	ActPayJailFine = "PAY_JAIL_FINE"
	ActUseJailCard = "USE_JAIL_CARD"
)
