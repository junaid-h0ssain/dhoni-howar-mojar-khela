package config

import (
	"os"
	"strings"
)

// Config holds all runtime configuration from environment variables.
type Config struct {
	Port           string
	RedisURL       string
	RedisPassword  string
	AllowedOrigins []string
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Load reads configuration from the environment.
func Load() Config {
	origins := []string{}
	if raw := os.Getenv("ALLOWED_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				origins = append(origins, o)
			}
		}
	}
	return Config{
		Port:           getenv("PORT", "8080"),
		RedisURL:       os.Getenv("REDIS_URL"),
		RedisPassword:  os.Getenv("REDIS_PASSWORD"),
		AllowedOrigins: origins,
	}
}
