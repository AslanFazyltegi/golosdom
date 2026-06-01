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

func (s *Service) ListNotifications(userID string, roles []string) ([]dto.NotificationResponse, error) {
	items, err := s.repo.ListNotifications(context.Background(), userID, roles)
	if err != nil {
		return nil, err
	}
	return mapNotifications(items), nil
}

func (s *Service) SendNotification(userID string, req dto.SaveNotificationRequest) (dto.NotificationResponse, error) {
	title := strings.TrimSpace(req.Title)
	body := strings.TrimSpace(req.Body)
	if title == "" {
		return dto.NotificationResponse{}, errors.New("title is required")
	}
	if body == "" {
		return dto.NotificationResponse{}, errors.New("body is required")
	}
	if len([]rune(body)) > 1000 {
		return dto.NotificationResponse{}, errors.New("notification body is too long")
	}
	buildingID, err := s.repo.GetPrimaryBuildingID(context.Background())
	if err != nil {
		return dto.NotificationResponse{}, err
	}
	item, err := s.repo.SaveNotification(context.Background(), repository.SaveNotificationData{
		ID:           fmt.Sprintf("communication-notification-%d", time.Now().UnixNano()),
		BuildingID:   buildingID,
		AuthorUserID: userID,
		Title:        title,
		Body:         body,
		Targets:      mapTargets(req.Targets),
		Channels:     mapChannels(req.Channels),
	})
	if err != nil {
		return dto.NotificationResponse{}, err
	}
	return mapNotification(item), nil
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
		result = append(result, dto.DeliveryResponse{
			ID: item.ID, EntityType: item.EntityType, EntityID: item.EntityID,
			EntityTitle: item.EntityTitle, UserID: item.UserID, Recipient: item.Recipient,
			Channel: item.Channel, Status: item.Status, SentAt: item.SentAt,
			DeliveredAt: item.DeliveredAt, ReadAt: item.ReadAt, ErrorMessage: item.ErrorMessage,
			CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt,
		})
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
		Title: item.Title, Body: item.Body, Status: item.Status,
		CreatedAt: item.CreatedAt, SentAt: item.SentAt, ReadAt: item.ReadAt,
		Targets: dtoTargets(item.Targets), Channels: dtoChannels(item.Channels),
	}
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
