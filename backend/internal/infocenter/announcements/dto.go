package announcements

import (
	"encoding/json"
	"time"
)

type SaveRequest struct {
	Title          string          `json:"title"`
	BodyJSON       json.RawMessage `json:"body_json"`
	BodyHTML       string          `json:"body_html"`
	Category       string          `json:"category"`
	AudienceType   string          `json:"audience_type"`
	AudienceFilter json.RawMessage `json:"audience_filter"`
	IsPinned       bool            `json:"is_pinned"`
	IsImportant    bool            `json:"is_important"`
	NotifyEnabled  bool            `json:"notify_enabled"`
	ActualUntil    *time.Time      `json:"actual_until"`
	ScheduledAt    *time.Time      `json:"scheduled_at"`
}

type ActionRequest struct {
	Reason      string     `json:"reason"`
	ScheduledAt *time.Time `json:"scheduled_at"`
}

type AnnouncementResponse struct {
	ID             string                       `json:"id"`
	Title          string                       `json:"title"`
	BodyJSON       json.RawMessage              `json:"body_json"`
	BodyHTML       string                       `json:"body_html"`
	Category       string                       `json:"category"`
	AudienceType   string                       `json:"audience_type"`
	AudienceFilter json.RawMessage              `json:"audience_filter"`
	Status         string                       `json:"status"`
	IsVisible      bool                         `json:"is_visible"`
	IsPinned       bool                         `json:"is_pinned"`
	IsImportant    bool                         `json:"is_important"`
	NotifyEnabled  bool                         `json:"notify_enabled"`
	PublishedAt    *time.Time                   `json:"published_at"`
	ScheduledAt    *time.Time                   `json:"scheduled_at"`
	ActualUntil    *time.Time                   `json:"actual_until"`
	HiddenAt       *time.Time                   `json:"hidden_at"`
	CompletedAt    *time.Time                   `json:"completed_at"`
	DeletedAt      *time.Time                   `json:"deleted_at"`
	CreatedBy      string                       `json:"created_by"`
	UpdatedBy      *string                      `json:"updated_by"`
	AuthorName     string                       `json:"author_name"`
	CreatedAt      time.Time                    `json:"created_at"`
	UpdatedAt      time.Time                    `json:"updated_at"`
	ViewsCount     int                          `json:"views_count"`
	ReadsCount     int                          `json:"reads_count"`
	ReadAt         *time.Time                   `json:"read_at"`
	History        []AnnouncementActionResponse `json:"history"`
}

type AnnouncementActionResponse struct {
	ID             string    `json:"id"`
	AnnouncementID string    `json:"announcement_id"`
	Action         string    `json:"action"`
	Reason         *string   `json:"reason"`
	ActorID        string    `json:"actor_id"`
	CreatedAt      time.Time `json:"created_at"`
}
