package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golosdom-backend/internal/common/response"
	"golosdom-backend/internal/profile/dto"
	"golosdom-backend/internal/profile/service"
)

const maxProfilePhotoUploadSize = 2 << 20

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

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID := r.Header.Get("X-User-ID")

	var req dto.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.service.ChangePassword(r.Context(), userID, req); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"message": "Пароль изменён",
	})
}

func (h *Handler) EndOtherSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID := r.Header.Get("X-User-ID")

	if err := h.service.EndOtherSessions(r.Context(), userID); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"message": "Другие сеансы завершены",
	})
}

func (h *Handler) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID := r.Header.Get("X-User-ID")
	r.Body = http.MaxBytesReader(w, r.Body, maxProfilePhotoUploadSize+(64<<10))
	if err := r.ParseMultipartForm(maxProfilePhotoUploadSize + (64 << 10)); err != nil {
		response.Error(w, http.StatusBadRequest, "Некорректная форма загрузки фото")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Файл фото обязателен")
		return
	}
	defer file.Close()

	if header.Size <= 0 {
		response.Error(w, http.StatusBadRequest, "Файл фото пустой")
		return
	}

	if header.Size > maxProfilePhotoUploadSize {
		response.Error(w, http.StatusBadRequest, "Размер фото не должен превышать 2 МБ")
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !isAllowedProfilePhotoExt(ext) {
		response.Error(w, http.StatusBadRequest, "Допустимые форматы фото: jpg, jpeg, png, webp")
		return
	}

	buffer := make([]byte, 512)
	read, readErr := file.Read(buffer)
	if readErr != nil && readErr != io.EOF {
		response.Error(w, http.StatusBadRequest, "Не удалось прочитать фото")
		return
	}
	mimeType := http.DetectContentType(buffer[:read])
	if seeker, ok := file.(io.Seeker); ok {
		if _, err := seeker.Seek(0, io.SeekStart); err != nil {
			response.Error(w, http.StatusInternalServerError, "Не удалось прочитать фото")
			return
		}
	}
	if !isAllowedProfilePhotoMime(mimeType, header.Header.Get("Content-Type")) {
		response.Error(w, http.StatusBadRequest, "Допустимые форматы фото: jpg, jpeg, png, webp")
		return
	}

	uploadDir := filepath.Join("uploads", "profile")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		response.Error(w, http.StatusInternalServerError, "Не удалось подготовить каталог загрузки")
		return
	}

	fileName := safeFileName(userID) + "-" + time.Now().UTC().Format("20060102150405") + ext
	filePath := filepath.Join(uploadDir, fileName)
	dst, err := os.Create(filePath)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Не удалось сохранить фото")
		return
	}
	size, copyErr := io.Copy(dst, file)
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil {
		response.Error(w, http.StatusInternalServerError, "Не удалось сохранить фото")
		return
	}
	if size > maxProfilePhotoUploadSize {
		_ = os.Remove(filePath)
		response.Error(w, http.StatusBadRequest, "Размер фото не должен превышать 2 МБ")
		return
	}

	photoPath := "/uploads/profile/" + fileName
	if err := h.service.UpdatePhoto(r.Context(), userID, photoPath); err != nil {
		_ = os.Remove(filePath)
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"photo": photoPath,
	})
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

func isAllowedProfilePhotoExt(ext string) bool {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	default:
		return false
	}
}

func isAllowedProfilePhotoMime(detected string, declared string) bool {
	if isAllowedProfilePhotoMimeValue(detected) {
		return true
	}

	return isAllowedProfilePhotoMimeValue(declared)
}

func isAllowedProfilePhotoMimeValue(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "image/jpeg", "image/png", "image/webp":
		return true
	default:
		return false
	}
}

func safeFileName(value string) string {
	var builder strings.Builder

	for _, char := range value {
		if char >= 'a' && char <= 'z' ||
			char >= 'A' && char <= 'Z' ||
			char >= '0' && char <= '9' ||
			char == '-' ||
			char == '_' ||
			char == '.' {
			builder.WriteRune(char)
			continue
		}
		builder.WriteRune('_')
	}

	if builder.Len() == 0 {
		return "user"
	}

	return builder.String()
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
