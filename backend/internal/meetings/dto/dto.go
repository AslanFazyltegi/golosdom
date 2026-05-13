package dto

import "time"

type CreateMeetingRequest struct {
	InitiatorName string   `json:"initiator_name"`
	ScheduledAt   string   `json:"scheduled_at"`
	Location      string   `json:"location"`
	Agenda        []string `json:"agenda"`
	MeetingForm   string   `json:"meeting_form"`
}

type MeetingResponse struct {
	ID            string    `json:"id"`
	InitiatorName string    `json:"initiator_name"`
	ScheduledAt   time.Time `json:"scheduled_at"`
	Location      string    `json:"location"`
	Agenda        []string  `json:"agenda"`
	MeetingForm   string    `json:"meeting_form"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
}
