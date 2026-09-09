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

// ReconnectTTL is the 120-second reconnection window from the spec.
const ReconnectTTL = 120 * time.Second

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

func (r *RedisStore) Close() error { return r.client.Close() }

// --- In-memory fallback (local dev without Redis) ---

type memEntry struct {
	session   Session
	expiresAt time.Time
}

// MemoryStore is a TTL-expiring in-memory SessionStore.
type MemoryStore struct {
	mu   sync.Mutex
	data map[string]memEntry
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{data: make(map[string]memEntry)}
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

func (m *MemoryStore) Close() error { return nil }

// NewSessionStore returns a Redis store when REDIS_URL is set,
// otherwise an in-memory store so `go run` works with zero config.
func NewSessionStore(redisURL, password string) SessionStore {
	if redisURL != "" {
		if rs, err := NewRedisStore(redisURL, password); err == nil {
			return rs
		}
	}
	return NewMemoryStore()
}
