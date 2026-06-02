package announcements

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"golosdom-backend/internal/common/response"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Announcements(w http.ResponseWriter, r *http.Request) {
	if !requireChairman(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		items, err := h.service.List(r.Context(), r.URL.Query().Get("status"), r.URL.Query().Get("search"), userID(r))
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, items)
	case http.MethodPost:
		var req SaveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
		item, err := h.service.Create(r.Context(), req, userID(r), r.URL.Query().Get("mode"))
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusCreated, item)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) AnnouncementsByID(w http.ResponseWriter, r *http.Request) {
	if !requireChairman(w, r) {
		return
	}
	id, action, extra := splitAnnouncementPath(r.URL.Path)
	if id == "" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}

	switch {
	case action == "" && r.Method == http.MethodGet:
		item, err := h.service.Get(r.Context(), id)
		writeItem(w, item, err)
	case action == "" && r.Method == http.MethodPut:
		var req SaveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
		item, err := h.service.Update(r.Context(), id, req, userID(r))
		writeItem(w, item, err)
	case action == "publish" && r.Method == http.MethodPost:
		item, err := h.service.Publish(r.Context(), id, userID(r))
		writeItem(w, item, err)
	case action == "schedule" && r.Method == http.MethodPost:
		req, ok := decodeAction(w, r)
		if !ok {
			return
		}
		item, err := h.service.Schedule(r.Context(), id, req, userID(r))
		writeItem(w, item, err)
	case action == "cancel-schedule" && r.Method == http.MethodPost:
		item, err := h.service.CancelSchedule(r.Context(), id, userID(r))
		writeItem(w, item, err)
	case action == "hide" && r.Method == http.MethodPost:
		req, ok := decodeAction(w, r)
		if !ok {
			return
		}
		item, err := h.service.Hide(r.Context(), id, req, userID(r))
		writeItem(w, item, err)
	case action == "show" && r.Method == http.MethodPost:
		item, err := h.service.Show(r.Context(), id, userID(r))
		writeItem(w, item, err)
	case action == "complete" && r.Method == http.MethodPost:
		req, ok := decodeAction(w, r)
		if !ok {
			return
		}
		item, err := h.service.Complete(r.Context(), id, req, userID(r))
		writeItem(w, item, err)
	case action == "delete" && r.Method == http.MethodPost:
		item, err := h.service.SoftDelete(r.Context(), id, userID(r))
		writeItem(w, item, err)
	case action == "restore" && r.Method == http.MethodPost:
		item, err := h.service.Restore(r.Context(), id, userID(r))
		writeItem(w, item, err)
	case action == "permanent" && r.Method == http.MethodDelete && extra == "":
		if err := h.service.PermanentDelete(r.Context(), id, userID(r)); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func writeItem(w http.ResponseWriter, item AnnouncementResponse, err error) {
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, item)
}

func decodeAction(w http.ResponseWriter, r *http.Request) (ActionRequest, bool) {
	var req ActionRequest
	if r.Body == nil {
		return req, true
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return req, false
	}
	return req, true
}

func splitAnnouncementPath(path string) (string, string, string) {
	rest := strings.TrimPrefix(path, "/api/infocenter/announcements/")
	if rest == path {
		rest = strings.TrimPrefix(path, "/api/v1/infocenter/announcements/")
	}
	if rest == path {
		return "", "", ""
	}
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		return "", "", ""
	}
	if len(parts) == 1 {
		return parts[0], "", ""
	}
	action := strings.Join(parts[1:], "/")
	extra := ""
	if len(parts) > 2 {
		extra = strings.Join(parts[2:], "/")
	}
	return parts[0], action, extra
}

func userID(r *http.Request) string {
	return r.Header.Get("X-User-ID")
}

func requireChairman(w http.ResponseWriter, r *http.Request) bool {
	if userID(r) == "" {
		response.Error(w, http.StatusUnauthorized, "missing user")
		return false
	}
	if strings.TrimSpace(r.URL.Query().Get("active_role")) != "" && strings.TrimSpace(r.URL.Query().Get("active_role")) != "CHAIRMAN" {
		response.Error(w, http.StatusForbidden, "only chairman can perform this action")
		return false
	}
	for _, role := range strings.Split(r.Header.Get("X-User-Roles"), ",") {
		if strings.TrimSpace(role) == "CHAIRMAN" {
			return true
		}
	}
	response.Error(w, http.StatusForbidden, "only chairman can perform this action")
	return false
}
