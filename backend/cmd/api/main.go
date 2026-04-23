package main

import (
	"log"
	"net/http"

	"golosdom-backend/internal/common/config"
	"golosdom-backend/internal/common/router"
)

func main() {
	cfg := config.Load()

	r := router.New()

	log.Printf("starting server on %s", cfg.HTTPPort)

	if err := http.ListenAndServe(cfg.HTTPPort, r); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}