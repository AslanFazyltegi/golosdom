package dto

import "time"

type TargetRequest struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type ChannelRequest struct {
	Channel string `json:"channel"`
	Enabled bool   `json:"enabled"`
}

type SavePostRequest struct {
	Type         string           `json:"type"`
	Title        string           `json:"title"`
	Body         string           `json:"body"`
	ImageURL     *string          `json:"image_url"`
	Status       string           `json:"status"`
	Importance   string           `json:"importance"`
	IsPinned     bool             `json:"is_pinned"`
	PublishAt    *time.Time       `json:"publish_at"`
	VisibleFrom  *time.Time       `json:"visible_from"`
	VisibleUntil *time.Time       `json:"visible_until"`
	Targets      []TargetRequest  `json:"targets"`
	Channels     []ChannelRequest `json:"channels"`
}

type PostResponse struct {
	ID           string           `json:"id"`
	BuildingID   string           `json:"building_id"`
	AuthorUserID string           `json:"author_user_id"`
	Type         string           `json:"type"`
	Title        string           `json:"title"`
	Body         string           `json:"body"`
	ImageURL     *string          `json:"image_url"`
	Status       string           `json:"status"`
	Importance   string           `json:"importance"`
	IsPinned     bool             `json:"is_pinned"`
	PublishAt    *time.Time       `json:"publish_at"`
	VisibleFrom  *time.Time       `json:"visible_from"`
	VisibleUntil *time.Time       `json:"visible_until"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
	DeletedAt    *time.Time       `json:"deleted_at"`
	ReadAt       *time.Time       `json:"read_at"`
	Targets      []TargetRequest  `json:"targets"`
	Channels     []ChannelRequest `json:"channels"`
}

type SaveNotificationRequest struct {
	Title    string           `json:"title"`
	Body     string           `json:"body"`
	Targets  []TargetRequest  `json:"targets"`
	Channels []ChannelRequest `json:"channels"`
}

type NotificationResponse struct {
	ID           string           `json:"id"`
	BuildingID   string           `json:"building_id"`
	AuthorUserID string           `json:"author_user_id"`
	Title        string           `json:"title"`
	Body         string           `json:"body"`
	Status       string           `json:"status"`
	CreatedAt    time.Time        `json:"created_at"`
	SentAt       *time.Time       `json:"sent_at"`
	ReadAt       *time.Time       `json:"read_at"`
	Targets      []TargetRequest  `json:"targets"`
	Channels     []ChannelRequest `json:"channels"`
}

type DeliveryResponse struct {
	ID           string     `json:"id"`
	EntityType   string     `json:"entity_type"`
	EntityID     string     `json:"entity_id"`
	EntityTitle  string     `json:"entity_title"`
	UserID       string     `json:"user_id"`
	Recipient    string     `json:"recipient"`
	Channel      string     `json:"channel"`
	Status       string     `json:"status"`
	SentAt       *time.Time `json:"sent_at"`
	DeliveredAt  *time.Time `json:"delivered_at"`
	ReadAt       *time.Time `json:"read_at"`
	ErrorMessage *string    `json:"error_message"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
