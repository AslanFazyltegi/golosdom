package router

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	authHandler "golosdom-backend/internal/auth/handler"
	authRepo "golosdom-backend/internal/auth/repository"
	authService "golosdom-backend/internal/auth/service"
	"golosdom-backend/internal/common/response"
	votingHandler "golosdom-backend/internal/voting/handler"
	votingRepo "golosdom-backend/internal/voting/repository"
	votingService "golosdom-backend/internal/voting/service"
)

func New(dbPool *pgxpool.Pool) http.Handler {
	mux := http.NewServeMux()

	authRepo := authRepo.New(dbPool)
	authSvc := authService.New(authRepo)
	authH := authHandler.New(authSvc)

	votingRepo := votingRepo.New(dbPool)
	votingSvc := votingService.New(votingRepo)
	votingH := votingHandler.New(votingSvc)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		response.JSON(w, http.StatusOK, map[string]string{
			"status": "ok",
		})
	})

	mux.HandleFunc("/db-health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		if err := dbPool.Ping(context.Background()); err != nil {
			response.Error(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}

		response.JSON(w, http.StatusOK, map[string]string{
			"database": "ok",
		})
	})

	mux.HandleFunc("/api/v1/auth/register", authH.Register)
	mux.HandleFunc("/api/v1/auth/login", authH.Login)
	mux.HandleFunc("/api/v1/auth/me", authH.Me)

	mux.HandleFunc("/api/v1/votings", authMiddleware(authSvc, votingH.ListOrCreate))

	return corsMiddleware(mux)
}

func authMiddleware(authSvc *authService.Service, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			response.Error(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		const prefix = "Bearer "
		if !strings.HasPrefix(authHeader, prefix) {
			response.Error(w, http.StatusUnauthorized, "invalid authorization header")
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(authHeader, prefix))
		user, err := authSvc.GetByID(token)
		if err != nil {
			response.Error(w, http.StatusUnauthorized, "invalid token")
			return
		}

		r.Header.Set("X-User-ID", user.ID)
		r.Header.Set("X-User-Roles", strings.Join(user.Roles, ","))

		next(w, r)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
