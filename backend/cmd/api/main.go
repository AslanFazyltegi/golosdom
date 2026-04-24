package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"golosdom-backend/internal/common/config"
	"golosdom-backend/internal/common/db"
	"golosdom-backend/internal/common/router"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dbPool, err := db.Connect(ctx, cfg.DBUrl)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer dbPool.Close()

	r := router.New(dbPool)

	log.Printf("database connected")
	log.Printf("starting server on %s", cfg.HTTPPort)

	if err := http.ListenAndServe(cfg.HTTPPort, r); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
