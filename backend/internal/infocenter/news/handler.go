package news

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"golosdom-backend/internal/common/response"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) News(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) NewsByID(w http.ResponseWriter, r *http.Request) {
	id, action, extra := splitNewsPath(r.URL.Path)
	if id == "" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}
	if id == "my" && action == "" && r.Method == http.MethodGet {
		if !requireUser(w, r) {
			return
		}
		items, err := h.service.ListForUser(r.Context(), userID(r))
		if err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, items)
		return
	}
	if action == "read" && r.Method == http.MethodPost {
		if !requireUser(w, r) {
			return
		}
		if err := h.service.MarkRead(r.Context(), id, userID(r)); err != nil {
			response.Error(w, http.StatusNotFound, "news not found")
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "read"})
		return
	}
	if !isChairmanRequest(r) {
		if action == "" && r.Method == http.MethodGet {
			item, err := h.service.GetForUser(r.Context(), id, userID(r))
			if err != nil {
				response.Error(w, http.StatusNotFound, "news not found")
				return
			}
			response.JSON(w, http.StatusOK, item)
			return
		}
		response.Error(w, http.StatusForbidden, "only chairman can perform this action")
		return
	}
	if !requireChairman(w, r) {
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
	case action == "images" && r.Method == http.MethodPost:
		h.uploadImage(w, r, id)
	case strings.HasPrefix(action, "images/") && r.Method == http.MethodDelete:
		imageID := strings.TrimPrefix(action, "images/")
		item, err := h.service.DeleteImage(r.Context(), id, imageID, userID(r))
		writeItem(w, item, err)
	case strings.HasPrefix(action, "cover/") && r.Method == http.MethodPost:
		imageID := strings.TrimPrefix(action, "cover/")
		item, err := h.service.SetCover(r.Context(), id, imageID, userID(r))
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
	case action == "unpublish" && r.Method == http.MethodPost:
		req, ok := decodeAction(w, r)
		if !ok {
			return
		}
		item, err := h.service.Unpublish(r.Context(), id, req, userID(r))
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

func (h *Handler) uploadImage(w http.ResponseWriter, r *http.Request, newsID string) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	mimeType := header.Header.Get("Content-Type")
	if !isAllowedImageMime(mimeType) {
		response.Error(w, http.StatusBadRequest, "allowed image types: jpeg, png, webp, gif")
		return
	}

	uploadDir := filepath.Join("uploads", "news")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to prepare upload directory")
		return
	}

	imageID := newID()
	ext := imageExt(mimeType)
	fileName := imageID + ext
	filePath := filepath.Join(uploadDir, fileName)
	dst, err := os.Create(filePath)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	size, copyErr := io.Copy(dst, file)
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	item, err := h.service.AddImage(r.Context(), ImageResponse{
		ID:        imageID,
		NewsID:    newsID,
		FileName:  fileName,
		FilePath:  filePath,
		FileURL:   "/uploads/news/" + fileName,
		MimeType:  mimeType,
		SizeBytes: size,
	}, userID(r))
	writeItem(w, item, err)
}

func isAllowedImageMime(mimeType string) bool {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		return true
	default:
		return false
	}
}

func imageExt(mimeType string) string {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".jpg"
	}
}

func writeItem(w http.ResponseWriter, item NewsResponse, err error) {
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

func splitNewsPath(path string) (string, string, string) {
	rest := strings.TrimPrefix(path, "/api/infocenter/news/")
	if rest == path {
		rest = strings.TrimPrefix(path, "/api/v1/infocenter/news/")
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

func requireUser(w http.ResponseWriter, r *http.Request) bool {
	if userID(r) == "" {
		response.Error(w, http.StatusUnauthorized, "missing user")
		return false
	}
	return true
}

func isChairmanRequest(r *http.Request) bool {
	if userID(r) == "" {
		return false
	}
	if strings.TrimSpace(r.URL.Query().Get("active_role")) != "" && strings.TrimSpace(r.URL.Query().Get("active_role")) != "CHAIRMAN" {
		return false
	}
	for _, role := range strings.Split(r.Header.Get("X-User-Roles"), ",") {
		if strings.TrimSpace(role) == "CHAIRMAN" {
			return true
		}
	}
	return false
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
