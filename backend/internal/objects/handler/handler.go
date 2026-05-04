package handler

import (
	"net/http"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/objects/service"
)

type Handler struct {
	service *service.Service
}

func New(
	service *service.Service,
) *Handler {

	return &Handler{
		service: service,
	}
}

func (h *Handler) Get(
	w http.ResponseWriter,
	r *http.Request,
) {

	role := r.URL.Query().Get(
		"role",
	)

	userID := r.Header.Get(
		"X-User-ID",
	)

	data, err := h.service.GetObjects(
		role,
		userID,
	)

	if err != nil {

		response.Error(
			w,
			http.StatusInternalServerError,
			err.Error(),
		)

		return
	}

	response.JSON(
		w,
		http.StatusOK,
		data,
	)
}
