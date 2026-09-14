package websocket

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"strings"
	"sync"

	"backend/pkg/game"
	"backend/pkg/models"
	"backend/pkg/store"

	"github.com/google/uuid"
)

// Hub manages active rooms (§7). Rooms also persist as snapshots in the store
// so a restart or deploy rehydrates them on demand instead of wiping games.
type Hub struct {
	mu       sync.RWMutex
	rooms    map[string]*Room
	sessions store.Store
}

// NewHub creates a Hub backed by the given store.
func NewHub(sessions store.Store) *Hub {
	return &Hub{rooms: make(map[string]*Room), sessions: sessions}
}

var roomCodeCharset = []byte("0123456789")

// GenerateRoomCode returns a unique 4-digit numeric code (§6.1).
func (h *Hub) GenerateRoomCode() string {
	for {
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			// Fallback to numeric slice of UUID on CSPRNG failure (extremely unlikely).
			u := strings.ReplaceAll(uuid.NewString(), "-", "")
			digits := make([]byte, 0, 4)
			for i := 0; i < len(u) && len(digits) < 4; i++ {
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
		if exists {
			continue
		}
		// Avoid reusing the code of a persisted (restart-surviving) room.
		if found, err := h.sessions.GameExists(ctxBG(), code); err != nil || found {
			continue
		}
		return code
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
		store.Session{RoomID: code, PlayerID: playerID}, store.SessionTTL)
	return room, host, token, nil
}

// GetRoom finds a live room by code (case-insensitive).
func (h *Hub) GetRoom(code string) (*Room, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.rooms[NormalizeCode(code)]
	return r, ok
}

// GetOrLoadRoom finds a live room, rehydrating it from its persisted snapshot
// when a restart or deploy dropped it from memory. Offline seats come back as
// IsConnected=false until their owners RECONNECT with their seat tokens.
func (h *Hub) GetOrLoadRoom(code string) (*Room, bool) {
	code = NormalizeCode(code)
	h.mu.RLock()
	r, ok := h.rooms[code]
	h.mu.RUnlock()
	if ok {
		return r, true
	}
	data, found, err := h.sessions.LoadGame(ctxBG(), code)
	if err != nil {
		log.Printf("hub: snapshot load for room %s failed: %v", code, err)
		return nil, false
	}
	if !found {
		return nil, false
	}
	var st models.GameState
	if err := json.Unmarshal(data, &st); err != nil {
		log.Printf("hub: snapshot decode for room %s failed: %v", code, err)
		return nil, false
	}
	if st.RoomID == "" {
		st.RoomID = code
	}
	room := NewRoom(code, game.NewEngine(&st), h)
	h.mu.Lock()
	if existing, ok := h.rooms[code]; ok {
		h.mu.Unlock()
		return existing, true
	}
	h.rooms[code] = room
	h.mu.Unlock()
	go room.Run()
	log.Printf("hub: rehydrated room %s from snapshot (%d players)", code, len(st.Players))
	return room, true
}

// RemoveRoom drops a room from memory. The persisted snapshot stays until its
// TTL so late returners can still rehydrate the game.
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
