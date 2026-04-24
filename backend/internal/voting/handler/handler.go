package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/voting/dto"
	"golosdom-backend/internal/voting/service"
)

type Handler struct {
	service *service.Service
}

func New(service *service.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	response.JSON(w, http.StatusOK, h.service.List())
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID := r.Header.Get("X-User-ID")
	rolesHeader := r.Header.Get("X-User-Roles")

	if userID == "" {
		response.Error(w, http.StatusUnauthorized, "missing user")
		return
	}

	if !hasRole(rolesHeader, "CHAIRMAN") {
		response.Error(w, http.StatusForbidden, "only chairman can create voting")
		return
	}

	var req dto.CreateVotingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	voting, err := h.service.Create(
		userID,
		req.Title,
		req.Description,
		req.Question,
		req.Options,
	)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, voting)
}

func hasRole(rolesHeader string, role string) bool {
	roles := strings.Split(rolesHeader, ",")
	for _, item := range roles {
		if strings.TrimSpace(item) == role {
			return true
		}
	}
	return false
}

func (h *Handler) ListOrCreate(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.List(w, r)
	case http.MethodPost:
		h.Create(w, r)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}
