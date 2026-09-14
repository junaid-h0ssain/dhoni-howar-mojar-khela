package store

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Session binds a session token to a room + player.
type Session struct {
	RoomID   string `json:"roomId"`
	PlayerID string `json:"playerId"`
}

// SessionStore persists player sessions for reconnection (§11).
// Implementations must expire entries after ttl.
type SessionStore interface {
	Save(ctx context.Context, token string, s Session, ttl time.Duration) error
	Lookup(ctx context.Context, token string) (Session, bool, error)
	Delete(ctx context.Context, token string) error
	Close() error
}

// GameStore persists full game snapshots so rooms survive backend restarts.
// Implementations must expire entries after ttl.
type GameStore interface {
	SaveGame(ctx context.Context, roomID string, data []byte, ttl time.Duration) error
	LoadGame(ctx context.Context, roomID string) (data []byte, found bool, err error)
	GameExists(ctx context.Context, roomID string) (bool, error)
	DeleteGame(ctx context.Context, roomID string) error
}

// Store is the combined persistence backend: seat sessions + game snapshots.
type Store interface {
	SessionStore
	GameStore
}

// ReconnectTTL is the 120-second gameplay grace window from the spec: after a
// disconnect the turn is forfeited and the seat marked offline, but the token
// and snapshot below live much longer so late returners reclaim their seat.
const ReconnectTTL = 120 * time.Second

// SessionTTL is how long a seat token stays valid (matches the game snapshot
// lifetime so a player returning hours later still rejoins as themselves).
const SessionTTL = 24 * time.Hour

// GameTTL is how long an abandoned game snapshot survives without activity.
const GameTTL = 24 * time.Hour

// --- Redis implementation ---

// RedisStore is a go-redis backed SessionStore (Upstash-compatible:
// REDIS_URL may be a full rediss:// URL).
type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(url, password string) (*RedisStore, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	if password != "" {
		opts.Password = password
	}
	return &RedisStore{client: redis.NewClient(opts)}, nil
}

func (r *RedisStore) key(token string) string { return "session:" + token }

func (r *RedisStore) Save(ctx context.Context, token string, s Session, ttl time.Duration) error {
	if err := r.client.HSet(ctx, r.key(token),
		"roomId", s.RoomID,
		"playerId", s.PlayerID,
	).Err(); err != nil {
		return err
	}
	return r.client.Expire(ctx, r.key(token), ttl).Err()
}

func (r *RedisStore) Lookup(ctx context.Context, token string) (Session, bool, error) {
	m, err := r.client.HGetAll(ctx, r.key(token)).Result()
	if err != nil {
		return Session{}, false, err
	}
	if len(m) == 0 {
		return Session{}, false, nil
	}
	return Session{RoomID: m["roomId"], PlayerID: m["playerId"]}, true, nil
}

func (r *RedisStore) Delete(ctx context.Context, token string) error {
	return r.client.Del(ctx, r.key(token)).Err()
}

func (r *RedisStore) gameKey(roomID string) string { return "game:" + roomID }

func (r *RedisStore) SaveGame(ctx context.Context, roomID string, data []byte, ttl time.Duration) error {
	return r.client.Set(ctx, r.gameKey(roomID), data, ttl).Err()
}

func (r *RedisStore) LoadGame(ctx context.Context, roomID string) ([]byte, bool, error) {
	data, err := r.client.Get(ctx, r.gameKey(roomID)).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return data, true, nil
}

func (r *RedisStore) GameExists(ctx context.Context, roomID string) (bool, error) {
	n, err := r.client.Exists(ctx, r.gameKey(roomID)).Result()
	return n > 0, err
}

func (r *RedisStore) DeleteGame(ctx context.Context, roomID string) error {
	return r.client.Del(ctx, r.gameKey(roomID)).Err()
}

func (r *RedisStore) Close() error { return r.client.Close() }

// --- In-memory fallback (local dev without Redis) ---

type memEntry struct {
	session   Session
	expiresAt time.Time
}

type memGameEntry struct {
	data      []byte
	expiresAt time.Time
}

// MemoryStore is a TTL-expiring in-memory Store.
type MemoryStore struct {
	mu    sync.Mutex
	data  map[string]memEntry
	games map[string]memGameEntry
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{data: make(map[string]memEntry), games: make(map[string]memGameEntry)}
}

func (m *MemoryStore) Save(_ context.Context, token string, s Session, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[token] = memEntry{session: s, expiresAt: time.Now().Add(ttl)}
	return nil
}

func (m *MemoryStore) Lookup(_ context.Context, token string) (Session, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.data[token]
	if !ok {
		return Session{}, false, nil
	}
	if time.Now().After(e.expiresAt) {
		delete(m.data, token)
		return Session{}, false, nil
	}
	return e.session, true, nil
}

func (m *MemoryStore) Delete(_ context.Context, token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.data, token)
	return nil
}

func (m *MemoryStore) SaveGame(_ context.Context, roomID string, data []byte, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]byte, len(data))
	copy(cp, data)
	m.games[roomID] = memGameEntry{data: cp, expiresAt: time.Now().Add(ttl)}
	return nil
}

func (m *MemoryStore) LoadGame(_ context.Context, roomID string) ([]byte, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.games[roomID]
	if !ok {
		return nil, false, nil
	}
	if time.Now().After(e.expiresAt) {
		delete(m.games, roomID)
		return nil, false, nil
	}
	cp := make([]byte, len(e.data))
	copy(cp, e.data)
	return cp, true, nil
}

func (m *MemoryStore) GameExists(_ context.Context, roomID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.games[roomID]
	if !ok {
		return false, nil
	}
	if time.Now().After(e.expiresAt) {
		delete(m.games, roomID)
		return false, nil
	}
	return true, nil
}

func (m *MemoryStore) DeleteGame(_ context.Context, roomID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.games, roomID)
	return nil
}

func (m *MemoryStore) Close() error { return nil }

// NewStore returns a Redis store when REDIS_URL is set,
// otherwise an in-memory store so `go run` works with zero config.
// Either way games persist across reloads within this process; only Redis
// survives a restart or deploy.
func NewStore(redisURL, password string) Store {
	if redisURL != "" {
		if rs, err := NewRedisStore(redisURL, password); err == nil {
			return rs
		}
	}
	return NewMemoryStore()
}
