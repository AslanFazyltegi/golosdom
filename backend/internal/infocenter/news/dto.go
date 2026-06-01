package news

import (
	"encoding/json"
	"time"
)

type SaveRequest struct {
	Title          string          `json:"title"`
	Summary        string          `json:"summary"`
	BodyJSON       json.RawMessage `json:"body_json"`
	BodyHTML       string          `json:"body_html"`
	Category       string          `json:"category"`
	AudienceType   string          `json:"audience_type"`
	AudienceFilter json.RawMessage `json:"audience_filter"`
	IsPinned       bool            `json:"is_pinned"`
	IsImportant    bool            `json:"is_important"`
	NotifyEnabled  bool            `json:"notify_enabled"`
	ScheduledAt    *time.Time      `json:"scheduled_at"`
}

type ActionRequest struct {
	Reason      string     `json:"reason"`
	ScheduledAt *time.Time `json:"scheduled_at"`
}

type NewsResponse struct {
	ID             string           `json:"id"`
	Title          string           `json:"title"`
	Summary        string           `json:"summary"`
	BodyJSON       json.RawMessage  `json:"body_json"`
	BodyHTML       string           `json:"body_html"`
	Category       string           `json:"category"`
	AudienceType   string           `json:"audience_type"`
	AudienceFilter json.RawMessage  `json:"audience_filter"`
	Status         string           `json:"status"`
	IsVisible      bool             `json:"is_visible"`
	IsPinned       bool             `json:"is_pinned"`
	IsImportant    bool             `json:"is_important"`
	NotifyEnabled  bool             `json:"notify_enabled"`
	CoverImageID   *string          `json:"cover_image_id"`
	PublishedAt    *time.Time       `json:"published_at"`
	ScheduledAt    *time.Time       `json:"scheduled_at"`
	HiddenAt       *time.Time       `json:"hidden_at"`
	UnpublishedAt  *time.Time       `json:"unpublished_at"`
	DeletedAt      *time.Time       `json:"deleted_at"`
	CreatedBy      string           `json:"created_by"`
	UpdatedBy      *string          `json:"updated_by"`
	AuthorName     string           `json:"author_name"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
	ViewsCount     int              `json:"views_count"`
	ReadsCount     int              `json:"reads_count"`
	Images         []ImageResponse  `json:"images"`
	History        []ActionResponse `json:"history"`
}

type ImageResponse struct {
	ID        string    `json:"id"`
	NewsID    string    `json:"news_id"`
	FileName  string    `json:"file_name"`
	FilePath  string    `json:"file_path"`
	FileURL   string    `json:"file_url"`
	MimeType  string    `json:"mime_type"`
	SizeBytes int64     `json:"size_bytes"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type ActionResponse struct {
	ID        string    `json:"id"`
	NewsID    string    `json:"news_id"`
	Action    string    `json:"action"`
	Reason    *string   `json:"reason"`
	ActorID   string    `json:"actor_id"`
	CreatedAt time.Time `json:"created_at"`
}
