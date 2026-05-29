package handler

import (
	"encoding/json"
	"net/http"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/profile/dto"
	"golosdom-backend/internal/profile/service"
)

type Handler struct {
	service *service.Service
}

func New(service *service.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.get(w, r)
	case http.MethodPatch:
		h.patch(w, r)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	activeRole := r.URL.Query().Get("active_role")

	data, err := h.service.GetProfile(r.Context(), userID, activeRole)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	activeRole := r.URL.Query().Get("active_role")

	var req dto.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := h.service.UpdateProfile(r.Context(), userID, req, activeRole)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}
