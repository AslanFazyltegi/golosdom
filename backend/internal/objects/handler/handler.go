package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/objects/dto"
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

func (h *Handler) MyProperties(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	data, err := h.service.GetMyProperties(r.Header.Get("X-User-ID"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) MyPropertyUpdateRequest(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/my-properties/")
	path = strings.Trim(path, "/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "update-requests" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}

	var req dto.CreatePropertyUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := h.service.CreatePropertyUpdateRequest(
		parts[0],
		r.Header.Get("X-User-ID"),
		req,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			response.Error(w, http.StatusNotFound, "property not found")
			return
		}
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, data)
}

func (h *Handler) Dashboard(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	data, err := h.service.GetDashboard()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) Properties(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	data, err := h.service.GetProperties()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) Owners(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	data, err := h.service.GetOwners()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) Users(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	data, err := h.service.GetUsers()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) PropertyUpdateRequests(
	w http.ResponseWriter,
	r *http.Request,
) {
	switch r.Method {
	case http.MethodGet:
		data, err := h.service.GetPropertyUpdateRequests(r.Header.Get("X-User-Roles"))
		if err != nil {
			writeServiceError(w, err)
			return
		}

		response.JSON(w, http.StatusOK, data)
	case http.MethodPatch:
		if err := h.service.MarkPropertyUpdateRequestsRead(r.Header.Get("X-User-Roles")); err != nil {
			writeServiceError(w, err)
			return
		}

		response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) Building(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPatch {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req dto.UpdateBuildingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	data, err := h.service.UpdateBuilding(
		req,
		r.Header.Get("X-User-ID"),
		r.Header.Get("X-User-Roles"),
	)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	response.JSON(w, http.StatusOK, data)
}

func (h *Handler) PropertyByID(
	w http.ResponseWriter,
	r *http.Request,
) {
	if r.Method != http.MethodPatch {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	propertyID := strings.TrimPrefix(r.URL.Path, "/api/v1/objects/properties/")
	propertyID = strings.Trim(propertyID, "/")
	if propertyID == "" {
		response.Error(w, http.StatusBadRequest, "property id is required")
		return
	}

	var req dto.UpdatePropertyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.service.UpdateProperty(
		propertyID,
		req,
		r.Header.Get("X-User-ID"),
		r.Header.Get("X-User-Roles"),
	)
	if err != nil {
		writeServiceError(w, err)
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeServiceError(w http.ResponseWriter, err error) {
	if errors.Is(err, service.ErrForbidden) || err.Error() == "forbidden" {
		response.Error(w, http.StatusForbidden, "forbidden")
		return
	}

	response.Error(w, http.StatusInternalServerError, err.Error())
}
