package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golosdom-backend/internal/communications/dto"
	"golosdom-backend/internal/communications/model"
	"golosdom-backend/internal/communications/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListPosts(userID string, roles []string, postType string, status string) ([]dto.PostResponse, error) {
	posts, err := s.repo.ListPosts(context.Background(), userID, roles, normalizePostType(postType), strings.TrimSpace(status))
	if err != nil {
		return nil, err
	}
	return mapPosts(posts), nil
}

func (s *Service) GetPost(userID string, roles []string, id string) (dto.PostResponse, error) {
	post, err := s.repo.GetPostForUser(context.Background(), id, userID, roles)
	if err != nil {
		return dto.PostResponse{}, err
	}
	return mapPost(post), nil
}

func (s *Service) SavePost(userID string, req dto.SavePostRequest, existingID string) (dto.PostResponse, error) {
	postType := normalizePostType(req.Type)
	if postType == "" {
		return dto.PostResponse{}, errors.New("type is required")
	}
	title := strings.TrimSpace(req.Title)
	body := strings.TrimSpace(req.Body)
	if title == "" {
		return dto.PostResponse{}, errors.New("title is required")
	}
	if body == "" {
		return dto.PostResponse{}, errors.New("body is required")
	}
	status := normalizePostStatus(req.Status, req.PublishAt)
	importance := normalizeImportance(req.Importance)
	buildingID, err := s.repo.GetPrimaryBuildingID(context.Background())
	if err != nil {
		return dto.PostResponse{}, err
	}
	id := existingID
	if id == "" {
		id = fmt.Sprintf("communication-post-%d", time.Now().UnixNano())
	}
	post, err := s.repo.SavePost(context.Background(), repository.SavePostData{
		ID:           id,
		BuildingID:   buildingID,
		AuthorUserID: userID,
		Type:         postType,
		Title:        title,
		Body:         body,
		ImageURL:     req.ImageURL,
		Status:       status,
		Importance:   importance,
		IsPinned:     req.IsPinned,
		PublishAt:    req.PublishAt,
		VisibleFrom:  req.VisibleFrom,
		VisibleUntil: req.VisibleUntil,
		Targets:      mapTargets(req.Targets),
		Channels:     mapChannels(req.Channels),
	})
	if err != nil {
		return dto.PostResponse{}, err
	}
	return mapPost(post), nil
}

func (s *Service) DeletePost(id string) error {
	return s.repo.DeletePost(context.Background(), id)
}

func (s *Service) MarkPostRead(userID string, id string) error {
	return s.repo.MarkPostRead(context.Background(), id, userID)
}

func (s *Service) ListNotifications(userID string, roles []string, status string, search string, category string, audience string, sort string) ([]dto.NotificationResponse, error) {
	items, err := s.repo.ListNotifications(context.Background(), userID, roles, repository.NotificationListFilter{
		Status: strings.TrimSpace(status), Search: strings.TrimSpace(search), Category: strings.TrimSpace(category),
		Audience: strings.TrimSpace(audience), Sort: strings.TrimSpace(sort),
	})
	if err != nil {
		return nil, err
	}
	return mapNotifications(items), nil
}

func (s *Service) GetNotification(userID string, roles []string, id string) (dto.NotificationResponse, error) {
	var item model.Notification
	var err error
	if hasRole(roles, "CHAIRMAN") {
		item, err = s.repo.GetNotification(context.Background(), id, userID)
	} else {
		item, err = s.repo.GetNotificationForUser(context.Background(), id, userID)
	}
	if err != nil {
		return dto.NotificationResponse{}, err
	}
	return mapNotification(item), nil
}

func (s *Service) SaveNotification(userID string, req dto.SaveNotificationRequest, existingID string, mode string) (dto.NotificationResponse, error) {
	title := strings.TrimSpace(req.Title)
	bodyHTML := strings.TrimSpace(req.BodyHTML)
	if bodyHTML == "" {
		bodyHTML = strings.TrimSpace(req.Body)
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		body = bodyHTML
	}
	if title == "" {
		return dto.NotificationResponse{}, errors.New("title is required")
	}
	if strings.TrimSpace(stripHTML(bodyHTML)) == "" {
		return dto.NotificationResponse{}, errors.New("body is required")
	}
	channels := mapChannels(req.Channels)
	if len(channels) == 0 {
		return dto.NotificationResponse{}, errors.New("at least one channel is required")
	}
	targets := mapTargets(req.Targets)
	if len(targets) == 0 {
		return dto.NotificationResponse{}, errors.New("audience is required")
	}
	buildingID, err := s.repo.GetPrimaryBuildingID(context.Background())
	if err != nil {
		return dto.NotificationResponse{}, err
	}
	status := strings.TrimSpace(req.Status)
	if mode == "draft" {
		status = "draft"
	} else if mode == "schedule" {
		status = "scheduled"
	} else if mode == "send" || mode == "publish" {
		status = "sent"
	}
	id := existingID
	if id == "" {
		id = fmt.Sprintf("communication-notification-%d", time.Now().UnixNano())
	}
	item, err := s.repo.SaveNotification(context.Background(), repository.SaveNotificationData{
		ID:           id,
		BuildingID:   buildingID,
		AuthorUserID: userID,
		Title:        title,
		Body:         body,
		BodyHTML:     bodyHTML,
		Status:       status,
		Category:     req.Category,
		ScheduledAt:  req.ScheduledAt,
		Targets:      targets,
		Channels:     channels,
	})
	if err != nil {
		return dto.NotificationResponse{}, err
	}
	return mapNotification(item), nil
}

func (s *Service) SendNotification(userID string, req dto.SaveNotificationRequest) (dto.NotificationResponse, error) {
	return s.SaveNotification(userID, req, "", "send")
}

func (s *Service) RunNotificationAction(userID string, id string, action string, req dto.NotificationActionRequest) (dto.NotificationResponse, error) {
	var status string
	var scheduledAt *time.Time
	switch strings.TrimSpace(action) {
	case "hide":
		status = "hidden"
	case "show":
		status = "sent"
	case "restore":
		status = "draft"
	case "delete":
		status = "deleted"
	case "send", "publish":
		status = "sent"
	case "schedule":
		status = "scheduled"
		scheduledAt = req.ScheduledAt
	case "complete":
		status = "completed"
	default:
		return dto.NotificationResponse{}, errors.New("unsupported action")
	}
	item, err := s.repo.SetNotificationStatus(context.Background(), id, status, scheduledAt)
	if err != nil {
		return dto.NotificationResponse{}, err
	}
	return mapNotification(item), nil
}

func (s *Service) PermanentDeleteNotification(id string) error {
	return s.repo.PermanentDeleteNotification(context.Background(), id)
}

func (s *Service) NotificationReport(id string) ([]dto.DeliveryResponse, error) {
	items, err := s.repo.ListDeliveriesForNotification(context.Background(), id)
	if err != nil {
		return nil, err
	}
	result := make([]dto.DeliveryResponse, 0, len(items))
	for _, item := range items {
		result = append(result, mapDelivery(item))
	}
	return result, nil
}

func (s *Service) MarkNotificationRead(userID string, id string) error {
	return s.repo.MarkNotificationRead(context.Background(), id, userID)
}

func (s *Service) ListDeliveries() ([]dto.DeliveryResponse, error) {
	items, err := s.repo.ListDeliveries(context.Background())
	if err != nil {
		return nil, err
	}
	result := make([]dto.DeliveryResponse, 0, len(items))
	for _, item := range items {
		result = append(result, mapDelivery(item))
	}
	return result, nil
}

func (s *Service) UnreadCounts(userID string) (map[string]int, error) {
	return s.repo.UnreadCounts(context.Background(), userID)
}

func normalizePostType(value string) string {
	value = strings.TrimSpace(value)
	if value == "news" || value == "announcement" {
		return value
	}
	return ""
}

func normalizePostStatus(value string, publishAt *time.Time) string {
	value = strings.TrimSpace(value)
	switch value {
	case "published", "hidden", "deleted", "draft":
		return value
	case "scheduled":
		return "scheduled"
	default:
		if publishAt != nil && publishAt.After(time.Now()) {
			return "scheduled"
		}
		return "draft"
	}
}

func normalizeImportance(value string) string {
	value = strings.TrimSpace(value)
	if value == "important" || value == "urgent" {
		return value
	}
	return "normal"
}

func hasRole(roles []string, role string) bool {
	for _, item := range roles {
		if strings.TrimSpace(item) == role {
			return true
		}
	}
	return false
}

func mapTargets(items []dto.TargetRequest) []model.Target {
	result := make([]model.Target, 0, len(items))
	for _, item := range items {
		result = append(result, model.Target{Type: item.Type, Value: item.Value})
	}
	return result
}

func mapChannels(items []dto.ChannelRequest) []model.Channel {
	result := make([]model.Channel, 0, len(items))
	for _, item := range items {
		result = append(result, model.Channel{Channel: item.Channel, Enabled: item.Enabled})
	}
	return result
}

func mapPosts(posts []model.Post) []dto.PostResponse {
	result := make([]dto.PostResponse, 0, len(posts))
	for _, post := range posts {
		result = append(result, mapPost(post))
	}
	return result
}

func mapPost(post model.Post) dto.PostResponse {
	return dto.PostResponse{
		ID: post.ID, BuildingID: post.BuildingID, AuthorUserID: post.AuthorUserID,
		Type: post.Type, Title: post.Title, Body: post.Body, ImageURL: post.ImageURL,
		Status: post.Status, Importance: post.Importance, IsPinned: post.IsPinned,
		PublishAt: post.PublishAt, VisibleFrom: post.VisibleFrom, VisibleUntil: post.VisibleUntil,
		CreatedAt: post.CreatedAt, UpdatedAt: post.UpdatedAt, DeletedAt: post.DeletedAt,
		ReadAt: post.ReadAt, Targets: dtoTargets(post.Targets), Channels: dtoChannels(post.Channels),
	}
}

func mapNotifications(items []model.Notification) []dto.NotificationResponse {
	result := make([]dto.NotificationResponse, 0, len(items))
	for _, item := range items {
		result = append(result, mapNotification(item))
	}
	return result
}

func mapNotification(item model.Notification) dto.NotificationResponse {
	return dto.NotificationResponse{
		ID: item.ID, BuildingID: item.BuildingID, AuthorUserID: item.AuthorUserID,
		Title: item.Title, Body: item.Body, BodyHTML: item.BodyHTML, Status: item.Status,
		Category: item.Category, AudienceSummary: item.AudienceSummary, CreatedAt: item.CreatedAt,
		UpdatedAt: item.UpdatedAt, ScheduledAt: item.ScheduledAt, SentAt: item.SentAt,
		DeletedAt: item.DeletedAt, HiddenAt: item.HiddenAt, ReadAt: item.ReadAt,
		Targets: dtoTargets(item.Targets), Channels: dtoChannels(item.Channels),
		DeliveryStats: deliveryStats(item.Deliveries),
	}
}

func mapDelivery(item model.Delivery) dto.DeliveryResponse {
	return dto.DeliveryResponse{
		ID: item.ID, EntityType: item.EntityType, EntityID: item.EntityID,
		EntityTitle: item.EntityTitle, UserID: item.UserID, Recipient: item.Recipient,
		PropertyLabel: item.PropertyLabel, Channel: item.Channel, Status: item.Status, SentAt: item.SentAt,
		DeliveredAt: item.DeliveredAt, ReadAt: item.ReadAt, ErrorMessage: item.ErrorMessage,
		CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt,
	}
}

func deliveryStats(items []model.Delivery) dto.DeliveryStatsResponse {
	recipients := map[string]bool{}
	delivered := map[string]bool{}
	read := map[string]bool{}
	errors := 0
	for _, item := range items {
		recipients[item.UserID] = true
		if item.Status == "delivered" || item.Status == "read" {
			delivered[item.UserID] = true
		}
		if item.Status == "read" {
			read[item.UserID] = true
		}
		if item.Status == "failed" || item.Status == "channel_not_connected" {
			errors++
		}
	}
	return dto.DeliveryStatsResponse{Recipients: len(recipients), Delivered: len(delivered), Read: len(read), Errors: errors}
}

func dtoTargets(items []model.Target) []dto.TargetRequest {
	result := make([]dto.TargetRequest, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TargetRequest{Type: item.Type, Value: item.Value})
	}
	return result
}

func dtoChannels(items []model.Channel) []dto.ChannelRequest {
	result := make([]dto.ChannelRequest, 0, len(items))
	for _, item := range items {
		result = append(result, dto.ChannelRequest{Channel: item.Channel, Enabled: item.Enabled})
	}
	return result
}

func stripHTML(value string) string {
	var builder strings.Builder
	inTag := false
	for _, char := range value {
		switch char {
		case '<':
			inTag = true
		case '>':
			inTag = false
		default:
			if !inTag {
				builder.WriteRune(char)
			}
		}
	}
	return strings.ReplaceAll(builder.String(), "&nbsp;", " ")
}
