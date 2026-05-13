package model

import "time"

type Meeting struct {
	ID            string
	InitiatorName string
	ScheduledAt   time.Time
	Location      string
	Agenda        []string
	MeetingForm   string
	CreatedBy     string
	CreatedAt     time.Time
}
