package handler

import (
	"encoding/json"
	"net/http"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/meetings/dto"
	"golosdom-backend/internal/meetings/service"
)

type Handler struct {
	service *service.Service
}

func New(service *service.Service) *Handler {
	return &Handler{service: service}
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

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")

	meetings, err := h.service.List(r.Context(), period)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to load meetings")
		return
	}

	response.JSON(w, http.StatusOK, meetings)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req dto.CreateMeetingRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.InitiatorName == "" {
		response.Error(w, http.StatusBadRequest, "initiator_name is required")
		return
	}

	if req.ScheduledAt == "" {
		response.Error(w, http.StatusBadRequest, "scheduled_at is required")
		return
	}

	if req.Location == "" {
		response.Error(w, http.StatusBadRequest, "location is required")
		return
	}

	if len(req.Agenda) == 0 {
		response.Error(w, http.StatusBadRequest, "agenda is required")
		return
	}

	userID := r.Header.Get("X-User-ID")

	meeting, err := h.service.Create(r.Context(), req, userID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, meeting)
}
