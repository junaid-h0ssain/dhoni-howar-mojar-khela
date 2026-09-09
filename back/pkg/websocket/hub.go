package websocket

import (
	"crypto/rand"
	"strings"
	"sync"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"

	"github.com/google/uuid"
)

// Hub manages active rooms (§7).
type Hub struct {
	mu       sync.RWMutex
	rooms    map[string]*Room
	sessions store.SessionStore
}

// NewHub creates a Hub backed by the given session store.
func NewHub(sessions store.SessionStore) *Hub {
	return &Hub{rooms: make(map[string]*Room), sessions: sessions}
}

var roomCodeCharset = []byte("0123456789")

// GenerateRoomCode returns a unique 6-digit numeric code (§6.1).
func (h *Hub) GenerateRoomCode() string {
	for {
		b := make([]byte, 6)
		if _, err := rand.Read(b); err != nil {
			// Fallback to numeric slice of UUID on CSPRNG failure (extremely unlikely).
			u := strings.ReplaceAll(uuid.NewString(), "-", "")
			digits := make([]byte, 0, 6)
			for i := 0; i < len(u) && len(digits) < 6; i++ {
				// Map each hex char to a digit 0-9.
				digits = append(digits, byte('0'+int(u[i])%10))
			}
			code := string(digits)
			if _, exists := h.rooms[code]; !exists {
				return code
			}
			continue
		}
		for i := range b {
			b[i] = roomCodeCharset[int(b[i])%len(roomCodeCharset)]
		}
		code := string(b)
		h.mu.RLock()
		_, exists := h.rooms[code]
		h.mu.RUnlock()
		if !exists {
			return code
		}
	}
}

// NormalizeCode trims user-typed codes (uppercases for backward compat with legacy alphanumeric codes).
func NormalizeCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// CreateRoom makes a room + host player and persists the host session.
func (h *Hub) CreateRoom(hostName string) (*Room, *models.Player, string, error) {
	code := h.GenerateRoomCode()
	engine := game.NewEngine(game.NewGame(code, ""))
	playerID := uuid.NewString()
	host, err := engine.AddPlayer(playerID, hostName)
	if err != nil {
		return nil, nil, "", err
	}
	engine.State.HostID = playerID

	room := NewRoom(code, engine, h)
	h.mu.Lock()
	h.rooms[code] = room
	h.mu.Unlock()
	go room.Run()

	token := uuid.NewString()
	_ = h.sessions.Save(ctxBG(), token,
		store.Session{RoomID: code, PlayerID: playerID}, store.ReconnectTTL)
	return room, host, token, nil
}

// GetRoom finds a room by code (case-insensitive).
func (h *Hub) GetRoom(code string) (*Room, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.rooms[NormalizeCode(code)]
	return r, ok
}

// RemoveRoom deletes an empty room.
func (h *Hub) RemoveRoom(code string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, code)
}

// RoomCount is exported for health checks / tests.
func (h *Hub) RoomCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms)
}
