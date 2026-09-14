package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"backend/pkg/config"
	"backend/pkg/store"
	ws "backend/pkg/websocket"
)

func main() {
	cfg := config.Load()
	sessions := store.NewStore(cfg.RedisURL, cfg.RedisPassword)
	defer func() { _ = sessions.Close() }()

	hub := ws.NewHub(sessions)
	allowed := make(map[string]bool, len(cfg.AllowedOrigins))
	for _, o := range cfg.AllowedOrigins {
		allowed[o] = true
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok", "rooms": hub.RoomCount(),
		})
	})
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWS(hub, allowed, w, r)
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("mahajoni backend listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
