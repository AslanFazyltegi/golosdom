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

	navigationHandler "golosdom-backend/internal/navigation/handler"
	navigationRepo "golosdom-backend/internal/navigation/repository"
	navigationService "golosdom-backend/internal/navigation/service"

	objectsHandler "golosdom-backend/internal/objects/handler"
	objectsRepo "golosdom-backend/internal/objects/repository"
	objectsService "golosdom-backend/internal/objects/service"

	ownersHandler "golosdom-backend/internal/owners/handler"
	ownersRepo "golosdom-backend/internal/owners/repository"
	ownersService "golosdom-backend/internal/owners/service"

	profileHandler "golosdom-backend/internal/profile/handler"
	profileRepo "golosdom-backend/internal/profile/repository"
	profileService "golosdom-backend/internal/profile/service"

	votingHandler "golosdom-backend/internal/voting/handler"
	votingRepo "golosdom-backend/internal/voting/repository"
	votingService "golosdom-backend/internal/voting/service"

	meetingsHandler "golosdom-backend/internal/meetings/handler"
	meetingsRepo "golosdom-backend/internal/meetings/repository"
	meetingsService "golosdom-backend/internal/meetings/service"
)

func New(dbPool *pgxpool.Pool) http.Handler {
	mux := http.NewServeMux()

	authRepo := authRepo.New(dbPool)
	authSvc := authService.New(authRepo)
	authH := authHandler.New(authSvc)

	votingRepo := votingRepo.New(dbPool)
	votingSvc := votingService.New(votingRepo)
	votingH := votingHandler.New(votingSvc)

	navigationRepo := navigationRepo.New(dbPool)
	navigationSvc := navigationService.New(navigationRepo)
	navigationH := navigationHandler.New(navigationSvc)

	objectsRepo := objectsRepo.New(dbPool)
	objectsSvc := objectsService.New(objectsRepo)
	objectsH := objectsHandler.New(objectsSvc)

	ownersRepo := ownersRepo.New(dbPool)
	ownersSvc := ownersService.New(ownersRepo)
	ownersH := ownersHandler.New(ownersSvc)

	meetingsRepo := meetingsRepo.New(dbPool)
	meetingsSvc := meetingsService.New(meetingsRepo)
	meetingsH := meetingsHandler.New(meetingsSvc)

	profileRepo := profileRepo.New(dbPool)
	profileSvc := profileService.New(profileRepo)
	profileH := profileHandler.New(profileSvc)

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

	mux.HandleFunc("/api/v1/navigation/menu", authMiddleware(authSvc, navigationH.GetMenu))

	mux.HandleFunc("/api/v1/auth/register", authH.Register)
	mux.HandleFunc("/api/v1/auth/login", authH.Login)
	mux.HandleFunc("/api/v1/auth/me", authH.Me)

	mux.HandleFunc(
		"/api/v1/profile",
		authMiddleware(
			authSvc,
			profileH.Get,
		),
	)

	mux.HandleFunc(
		"/api/v1/objects",
		authMiddleware(
			authSvc,
			objectsH.Get,
		),
	)
	mux.HandleFunc("/api/v1/my-properties", authMiddleware(authSvc, objectsH.MyProperties))
	mux.HandleFunc("/api/v1/my-properties/", authMiddleware(authSvc, objectsH.MyPropertyUpdateRequest))
	mux.HandleFunc("/api/v1/objects/dashboard", authMiddleware(authSvc, objectsH.Dashboard))
	mux.HandleFunc("/api/v1/objects/properties", authMiddleware(authSvc, objectsH.Properties))
	mux.HandleFunc("/api/v1/objects/properties/", authMiddleware(authSvc, objectsH.PropertyByID))
	mux.HandleFunc("/api/v1/objects/owners", authMiddleware(authSvc, objectsH.Owners))
	mux.HandleFunc("/api/v1/objects/users", authMiddleware(authSvc, objectsH.Users))
	mux.HandleFunc("/api/v1/objects/building", authMiddleware(authSvc, objectsH.Building))

	mux.HandleFunc(
		"/api/v1/owners",
		authMiddleware(
			authSvc,
			ownersH.Get,
		),
	)

	mux.HandleFunc("/api/v1/votings", authMiddleware(authSvc, votingH.ListOrCreate))
	mux.HandleFunc("/api/v1/votings/draft", authMiddleware(authSvc, votingH.CreateDraft))
	mux.HandleFunc("/api/v1/votings/", authMiddleware(authSvc, votingH.VotingByID))

	mux.HandleFunc("/api/v1/meetings", authMiddleware(authSvc, meetingsH.ListOrCreate))

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
