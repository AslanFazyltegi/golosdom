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

	votings, err := h.service.List(strings.TrimSpace(r.URL.Query().Get("status")))
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, votings)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !requireChairman(w, r) {
		return
	}

	userID := r.Header.Get("X-User-ID")
	var req dto.CreateVotingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	voting, err := h.service.Create(userID, req.Title, req.Description, req.Question, req.Options)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, voting)
}

func (h *Handler) CreateDraft(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !requireChairman(w, r) {
		return
	}

	var req dto.SaveDraftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	voting, err := h.service.SaveDraft(r.Header.Get("X-User-ID"), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, voting)
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

func (h *Handler) VotingByID(w http.ResponseWriter, r *http.Request) {
	id, action := splitVotingPath(r.URL.Path)
	if id == "" {
		response.Error(w, http.StatusNotFound, "not found")
		return
	}

	switch {
	case action == "" && r.Method == http.MethodGet:
		voting, err := h.service.Get(id)
		if err != nil {
			response.Error(w, http.StatusNotFound, "voting not found")
			return
		}
		response.JSON(w, http.StatusOK, voting)
	case action == "" && r.Method == http.MethodDelete:
		if !requireChairman(w, r) {
			return
		}
		if err := h.service.Delete(id); err != nil {
			response.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	case action == "draft" && r.Method == http.MethodPut:
		h.updateDraft(w, r, id)
	case action == "submit-to-council" && r.Method == http.MethodPost:
		h.submitToCouncil(w, r, id)
	case action == "resubmit-to-council" && r.Method == http.MethodPost:
		h.resubmitToCouncil(w, r, id)
	case action == "schedule-publication" && r.Method == http.MethodPost:
		h.schedulePublication(w, r, id)
	case action == "approval" && r.Method == http.MethodGet:
		h.approval(w, r, id)
	case action == "approval/vote" && r.Method == http.MethodPost:
		h.vote(w, r, id)
	default:
		response.Error(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) updateDraft(w http.ResponseWriter, r *http.Request, id string) {
	if !requireChairman(w, r) {
		return
	}

	var req dto.SaveDraftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	voting, err := h.service.UpdateDraft(id, r.Header.Get("X-User-ID"), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, voting)
}

func (h *Handler) submitToCouncil(w http.ResponseWriter, r *http.Request, id string) {
	if !requireChairman(w, r) {
		return
	}
	voting, warning, err := h.service.SubmitToCouncil(id)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"voting": voting, "warning": warning})
}

func (h *Handler) resubmitToCouncil(w http.ResponseWriter, r *http.Request, id string) {
	if !requireChairman(w, r) {
		return
	}
	voting, warning, err := h.service.ResubmitToCouncil(id)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"voting": voting, "warning": warning})
}

func (h *Handler) schedulePublication(w http.ResponseWriter, r *http.Request, id string) {
	if !requireChairman(w, r) {
		return
	}

	var req dto.SchedulePublicationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	voting, err := h.service.SchedulePublication(id, req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, voting)
}

func (h *Handler) approval(w http.ResponseWriter, r *http.Request, id string) {
	if !requireCouncil(w, r) {
		return
	}
	approval, err := h.service.CurrentApproval(id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "approval not found")
		return
	}
	response.JSON(w, http.StatusOK, approval)
}

func (h *Handler) vote(w http.ResponseWriter, r *http.Request, id string) {
	if !requireCouncil(w, r) {
		return
	}

	var req dto.ApprovalVoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	approval, err := h.service.Vote(id, r.Header.Get("X-User-ID"), req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, approval)
}

func splitVotingPath(path string) (string, string) {
	rest := strings.TrimPrefix(path, "/api/v1/votings/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" || parts[0] == rest && strings.HasPrefix(rest, "/api/") {
		return "", ""
	}
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.Join(parts[1:], "/")
}

func requireChairman(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("X-User-ID") == "" {
		response.Error(w, http.StatusUnauthorized, "missing user")
		return false
	}
	if !hasRole(r.Header.Get("X-User-Roles"), "CHAIRMAN") {
		response.Error(w, http.StatusForbidden, "only chairman can perform this action")
		return false
	}
	return true
}

func requireCouncil(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("X-User-ID") == "" {
		response.Error(w, http.StatusUnauthorized, "missing user")
		return false
	}
	roles := r.Header.Get("X-User-Roles")
	if !hasRole(roles, "CHAIRMAN") && !hasRole(roles, "COUNCIL_MEMBER") {
		response.Error(w, http.StatusForbidden, "only council members can perform this action")
		return false
	}
	return true
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
