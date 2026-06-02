package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/communications/dto"
	"golosdom-backend/internal/communications/service"
)

type Handler struct {
	service *service.Service
}

func New(service *service.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Posts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		postType := strings.TrimSpace(r.URL.Query().Get("type"))
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		items, err := h.service.ListPosts(userID(r), effectiveRoles(r), postType, status)
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, items)
	case http.MethodPost:
		if !requireChairman(w, r) {
			return
		}
		var req dto.SavePostRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
		item, err := h.service.SavePost(userID(r), req, "")
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusCreated, item)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) PostByID(w http.ResponseWriter, r *http.Request) {
	id, action := splitPath(r.URL.Path, "/api/v1/communications/posts/")
	if id == "" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}
	switch {
	case action == "" && r.Method == http.MethodGet:
		item, err := h.service.GetPost(userID(r), effectiveRoles(r), id)
		if err != nil {
			response.Error(w, http.StatusNotFound, "post not found")
			return
		}
		response.JSON(w, http.StatusOK, item)
	case action == "" && r.Method == http.MethodPut:
		if !requireChairman(w, r) {
			return
		}
		var req dto.SavePostRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
		item, err := h.service.SavePost(userID(r), req, id)
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, item)
	case action == "" && r.Method == http.MethodDelete:
		if !requireChairman(w, r) {
			return
		}
		if err := h.service.DeletePost(id); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	case action == "read" && r.Method == http.MethodPost:
		if err := h.service.MarkPostRead(userID(r), id); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "read"})
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) Notifications(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		query := r.URL.Query()
		items, err := h.service.ListNotifications(userID(r), effectiveRoles(r), query.Get("status"), query.Get("search"), query.Get("category"), query.Get("audience"), query.Get("sort"))
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, items)
	case http.MethodPost:
		if !requireChairman(w, r) {
			return
		}
		var req dto.SaveNotificationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
		item, err := h.service.SaveNotification(userID(r), req, "", r.URL.Query().Get("mode"))
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusCreated, item)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) NotificationByID(w http.ResponseWriter, r *http.Request) {
	id, action := splitPath(r.URL.Path, "/api/v1/communications/notifications/")
	if id == "" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}
	if action == "read" && r.Method == http.MethodPost {
		if err := h.service.MarkNotificationRead(userID(r), id); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "read"})
		return
	}
	switch {
	case action == "" && r.Method == http.MethodGet:
		item, err := h.service.GetNotification(userID(r), effectiveRoles(r), id)
		if err != nil {
			response.Error(w, http.StatusNotFound, "notification not found")
			return
		}
		response.JSON(w, http.StatusOK, item)
	case action == "" && r.Method == http.MethodPut:
		if !requireChairman(w, r) {
			return
		}
		var req dto.SaveNotificationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
		item, err := h.service.SaveNotification(userID(r), req, id, r.URL.Query().Get("mode"))
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, item)
	case action == "report" && r.Method == http.MethodGet:
		if !requireChairman(w, r) {
			return
		}
		items, err := h.service.NotificationReport(id)
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, items)
	case action == "permanent" && r.Method == http.MethodDelete:
		if !requireChairman(w, r) {
			return
		}
		if err := h.service.PermanentDeleteNotification(id); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	case r.Method == http.MethodPost:
		if !requireChairman(w, r) {
			return
		}
		var req dto.NotificationActionRequest
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&req)
		}
		item, err := h.service.RunNotificationAction(userID(r), id, action, req)
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, item)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) Deliveries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !requireChairman(w, r) {
		return
	}
	items, err := h.service.ListDeliveries()
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, items)
}

func (h *Handler) UnreadCounts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	counts, err := h.service.UnreadCounts(userID(r))
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, counts)
}

func splitPath(path string, prefix string) (string, string) {
	rest := strings.TrimPrefix(path, prefix)
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" || rest == path {
		return "", ""
	}
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], "/")
}

func userID(r *http.Request) string {
	return r.Header.Get("X-User-ID")
}

func roles(r *http.Request) []string {
	return strings.Split(r.Header.Get("X-User-Roles"), ",")
}

func effectiveRoles(r *http.Request) []string {
	activeRole := strings.TrimSpace(r.URL.Query().Get("active_role"))
	if activeRole == "" {
		return roles(r)
	}
	for _, role := range roles(r) {
		if strings.TrimSpace(role) == activeRole {
			return []string{activeRole}
		}
	}
	return roles(r)
}

func requireChairman(w http.ResponseWriter, r *http.Request) bool {
	if userID(r) == "" {
		response.Error(w, http.StatusUnauthorized, "missing user")
		return false
	}
	for _, role := range roles(r) {
		if strings.TrimSpace(role) == "CHAIRMAN" {
			return true
		}
	}
	response.Error(w, http.StatusForbidden, "only chairman can perform this action")
	return false
}
