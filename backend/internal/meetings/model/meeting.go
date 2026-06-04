package model

import "time"

type Meeting struct {
	ID             string
	BuildingID     string
	InitiatorName  string
	ScheduledAt    time.Time
	Location       string
	Agenda         []string
	MeetingForm    string
	CreatedBy      string
	CreatedAt      time.Time
	NotificationID *string
	AnnouncementID *string
}
