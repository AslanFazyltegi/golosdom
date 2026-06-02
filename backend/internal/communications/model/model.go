package model

import "time"

type Target struct {
	Type  string
	Value string
}

type Channel struct {
	Channel string
	Enabled bool
}

type Post struct {
	ID           string
	BuildingID   string
	AuthorUserID string
	Type         string
	Title        string
	Body         string
	ImageURL     *string
	Status       string
	Importance   string
	IsPinned     bool
	PublishAt    *time.Time
	VisibleFrom  *time.Time
	VisibleUntil *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
	ReadAt       *time.Time
	Targets      []Target
	Channels     []Channel
}

type Notification struct {
	ID              string
	BuildingID      string
	AuthorUserID    string
	Title           string
	Body            string
	BodyHTML        string
	Status          string
	Category        *string
	AudienceSummary *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	ScheduledAt     *time.Time
	SentAt          *time.Time
	DeletedAt       *time.Time
	HiddenAt        *time.Time
	ReadAt          *time.Time
	Targets         []Target
	Channels        []Channel
	Deliveries      []Delivery
}

type Delivery struct {
	ID            string
	EntityType    string
	EntityID      string
	EntityTitle   string
	UserID        string
	Recipient     string
	PropertyLabel string
	Channel       string
	Status        string
	SentAt        *time.Time
	DeliveredAt   *time.Time
	ReadAt        *time.Time
	ErrorMessage  *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
