package news

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"regexp"
	"strings"
	"time"

	communicationsDTO "golosdom-backend/internal/communications/dto"
	communicationsService "golosdom-backend/internal/communications/service"

	"github.com/microcosm-cc/bluemonday"
)

type Service struct {
	repo      *Repository
	notifier  *communicationsService.Service
	sanitizer *bluemonday.Policy
}

func NewService(repo *Repository, notifier ...*communicationsService.Service) *Service {
	policy := bluemonday.UGCPolicy()
	documentElements := []string{
		"p", "br", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
		"span", "ul", "ol", "li", "blockquote", "a", "table", "thead", "tbody",
		"tr", "th", "td", "hr", "img", "sup", "sub", "pre", "code",
	}
	styleElements := []string{
		"p", "h1", "h2", "h3", "h4", "span", "table", "thead", "tbody",
		"tr", "td", "th", "blockquote", "ul", "ol", "li",
	}
	cssColor := regexp.MustCompile(`(?i)^(\#[0-9a-f]{3,8}|rgba?\([0-9\s,.%]+\)|[a-z]+)$`)
	cssSize := regexp.MustCompile(`(?i)^[0-9.]+(px|pt|em|rem|%)$`)
	cssFamily := regexp.MustCompile(`^[\p{L}\p{N}\s,"'_().-]+$`)

	policy.AllowElements(documentElements...)
	policy.AllowImages()
	policy.AllowDataURIImages()
	policy.AllowTables()
	policy.AllowLists()
	policy.AllowAttrs("style").OnElements(styleElements...)
	policy.AllowAttrs("class").OnElements(documentElements...)
	policy.AllowAttrs("href", "target", "rel").OnElements("a")
	policy.AllowAttrs("src", "alt", "title", "width", "height").OnElements("img")
	policy.AllowAttrs("width", "height").OnElements("table", "td", "th", "img")
	policy.AllowStyles("text-align").MatchingEnum("left", "center", "right", "justify").OnElements(styleElements...)
	policy.AllowStyles("color", "background-color").Matching(cssColor).OnElements(styleElements...)
	policy.AllowStyles("font-size").Matching(cssSize).OnElements(styleElements...)
	policy.AllowStyles("font-family").Matching(cssFamily).OnElements(styleElements...)
	var notificationService *communicationsService.Service
	if len(notifier) > 0 {
		notificationService = notifier[0]
	}
	return &Service{repo: repo, notifier: notificationService, sanitizer: policy}
}

func (s *Service) List(ctx context.Context, status string, search string, actorID string) ([]NewsResponse, error) {
	if err := s.repo.AutoPublishDue(ctx, actorID); err != nil {
		return nil, err
	}
	return s.repo.List(ctx, listFilter{Status: normalizeStatus(status), Search: strings.TrimSpace(search)})
}

func (s *Service) Get(ctx context.Context, id string) (NewsResponse, error) {
	return s.repo.Get(ctx, id)
}

func (s *Service) ListForUser(ctx context.Context, userID string) ([]NewsResponse, error) {
	return s.repo.ListForUser(ctx, userID)
}

func (s *Service) GetForUser(ctx context.Context, id string, userID string) (NewsResponse, error) {
	return s.repo.GetForUser(ctx, id, userID)
}

func (s *Service) MarkRead(ctx context.Context, id string, userID string) error {
	return s.repo.MarkRead(ctx, id, userID)
}

func (s *Service) Create(ctx context.Context, req SaveRequest, actorID string, mode string) (NewsResponse, error) {
	prepared, err := s.prepare(req)
	if err != nil {
		return NewsResponse{}, err
	}
	status := "draft"
	if mode == "publish" {
		status = "published"
	}
	if mode == "schedule" {
		if prepared.ScheduledAt == nil {
			return NewsResponse{}, errors.New("scheduled_at is required")
		}
		status = "scheduled"
	}
	item, err := s.repo.Create(ctx, newID(), prepared, actorID, status)
	if err != nil {
		return NewsResponse{}, err
	}
	return s.sendPublicationNotification(ctx, item, actorID)
}

func (s *Service) Update(ctx context.Context, id string, req SaveRequest, actorID string) (NewsResponse, error) {
	prepared, err := s.prepare(req)
	if err != nil {
		return NewsResponse{}, err
	}
	return s.repo.Update(ctx, id, prepared, actorID)
}

func (s *Service) Publish(ctx context.Context, id string, actorID string) (NewsResponse, error) {
	item, err := s.repo.SetStatus(ctx, id, "published", "published", nil, nil, actorID)
	if err != nil {
		return NewsResponse{}, err
	}
	return s.sendPublicationNotification(ctx, item, actorID)
}

func (s *Service) Schedule(ctx context.Context, id string, req ActionRequest, actorID string) (NewsResponse, error) {
	if req.ScheduledAt == nil {
		return NewsResponse{}, errors.New("scheduled_at is required")
	}
	return s.repo.SetStatus(ctx, id, "scheduled", "scheduled", nil, req.ScheduledAt, actorID)
}

func (s *Service) CancelSchedule(ctx context.Context, id string, actorID string) (NewsResponse, error) {
	return s.repo.SetStatus(ctx, id, "draft", "schedule_cancelled", nil, nil, actorID)
}

func (s *Service) Hide(ctx context.Context, id string, req ActionRequest, actorID string) (NewsResponse, error) {
	return s.repo.SetStatus(ctx, id, "hidden", "hidden", optionalReason(req.Reason), nil, actorID)
}

func (s *Service) Show(ctx context.Context, id string, actorID string) (NewsResponse, error) {
	return s.repo.SetStatus(ctx, id, "published", "shown", nil, nil, actorID)
}

func (s *Service) Unpublish(ctx context.Context, id string, req ActionRequest, actorID string) (NewsResponse, error) {
	if strings.TrimSpace(req.Reason) == "" {
		return NewsResponse{}, errors.New("reason is required")
	}
	return s.repo.SetStatus(ctx, id, "unpublished", "unpublished", optionalReason(req.Reason), nil, actorID)
}

func (s *Service) SoftDelete(ctx context.Context, id string, actorID string) (NewsResponse, error) {
	return s.repo.SetStatus(ctx, id, "deleted", "deleted", nil, nil, actorID)
}

func (s *Service) Restore(ctx context.Context, id string, actorID string) (NewsResponse, error) {
	return s.repo.SetStatus(ctx, id, "draft", "restored", nil, nil, actorID)
}

func (s *Service) PermanentDelete(ctx context.Context, id string, actorID string) error {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.PermanentDelete(ctx, id, actorID); err != nil {
		return err
	}
	for _, image := range item.Images {
		_ = os.Remove(image.FilePath)
	}
	return nil
}

func (s *Service) AddImage(ctx context.Context, image ImageResponse, actorID string) (NewsResponse, error) {
	return s.repo.AddImage(ctx, image, actorID)
}

func (s *Service) DeleteImage(ctx context.Context, newsID string, imageID string, actorID string) (NewsResponse, error) {
	item, err := s.repo.Get(ctx, newsID)
	if err != nil {
		return NewsResponse{}, err
	}
	var filePath string
	for _, image := range item.Images {
		if image.ID == imageID {
			filePath = image.FilePath
			break
		}
	}
	updated, err := s.repo.DeleteImage(ctx, newsID, imageID, actorID)
	if err != nil {
		return NewsResponse{}, err
	}
	if filePath != "" {
		_ = os.Remove(filePath)
	}
	return updated, nil
}

func (s *Service) SetCover(ctx context.Context, newsID string, imageID string, actorID string) (NewsResponse, error) {
	return s.repo.SetCover(ctx, newsID, imageID, actorID)
}

func (s *Service) sendPublicationNotification(ctx context.Context, item NewsResponse, actorID string) (NewsResponse, error) {
	if item.Status != "published" || !item.NotifyEnabled || s.notifier == nil {
		return item, nil
	}
	category := item.Category
	_, err := s.notifier.SaveNotification(actorID, communicationsDTO.SaveNotificationRequest{
		Title:    "Новая новость: " + item.Title,
		Body:     item.Summary,
		BodyHTML: item.BodyHTML,
		Status:   "sent",
		Category: &category,
		Targets:  notificationTargets(item.AudienceType),
		Channels: []communicationsDTO.ChannelRequest{
			{Channel: "portal", Enabled: true},
		},
	}, "infocenter-news-"+item.ID, "send")
	if err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) prepare(req SaveRequest) (SaveRequest, error) {
	req.Title = strings.TrimSpace(req.Title)
	req.Summary = strings.TrimSpace(req.Summary)
	req.Category = strings.TrimSpace(req.Category)
	req.AudienceType = strings.TrimSpace(req.AudienceType)
	req.BodyHTML = s.sanitizer.Sanitize(req.BodyHTML)
	if req.Title == "" {
		return req, errors.New("title is required")
	}
	if req.Summary == "" {
		return req, errors.New("summary is required")
	}
	if req.Category == "" {
		return req, errors.New("category is required")
	}
	if req.AudienceType == "" {
		return req, errors.New("audience_type is required")
	}
	if len(req.BodyJSON) == 0 || !json.Valid(req.BodyJSON) {
		return req, errors.New("body_json is required")
	}
	if strings.TrimSpace(req.BodyHTML) == "" {
		return req, errors.New("body_html is required")
	}
	if len(req.AudienceFilter) == 0 {
		req.AudienceFilter = json.RawMessage("null")
	}
	return req, nil
}

func normalizeStatus(value string) string {
	switch strings.TrimSpace(value) {
	case "draft", "scheduled", "published", "hidden", "unpublished", "deleted":
		return value
	default:
		return ""
	}
}

func optionalReason(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func notificationTargets(audienceType string) []communicationsDTO.TargetRequest {
	switch audienceType {
	case "apartments_commercial":
		return []communicationsDTO.TargetRequest{
			{Type: "property_type", Value: "apartment"},
			{Type: "property_type", Value: "commercial_room"},
		}
	case "storage_parking":
		return []communicationsDTO.TargetRequest{
			{Type: "property_type", Value: "storage"},
			{Type: "property_type", Value: "parking"},
		}
	case "council_members":
		return []communicationsDTO.TargetRequest{{Type: "role", Value: "COUNCIL_MEMBER"}}
	default:
		return []communicationsDTO.TargetRequest{{Type: "all", Value: ""}}
	}
}

func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return strings.ReplaceAll(time.Now().Format("20060102150405.000000000"), ".", "")
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(bytes[:])
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:32]
}
