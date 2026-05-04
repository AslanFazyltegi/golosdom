package handler

import (
	"net/http"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/navigation/service"
)

type Handler struct {
	service *service.Service
}

func New(service *service.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) GetMenu(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	role := r.URL.Query().Get("role")
	if role == "" {
		response.Error(w, http.StatusBadRequest, "role is required")
		return
	}

	menu, err := h.service.GetMenuByRole(role)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to load menu")
		return
	}

	response.JSON(w, http.StatusOK, menu)
}
