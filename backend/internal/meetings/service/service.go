package service

import (
	"context"
	"strings"
	"time"

	"golosdom-backend/internal/meetings/dto"
	"golosdom-backend/internal/meetings/model"
	"golosdom-backend/internal/meetings/repository"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Create(ctx context.Context, req dto.CreateMeetingRequest, userID string) (*dto.MeetingResponse, error) {
	scheduledAt, err := time.Parse("2006-01-02T15:04", req.ScheduledAt)
	if err != nil {
		scheduledAt, err = time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			return nil, err
		}
	}

	meetingForm := strings.TrimSpace(req.MeetingForm)
	if meetingForm == "" {
		meetingForm = "offline"
	}

	created, err := s.repo.Create(ctx, model.Meeting{
		InitiatorName: strings.TrimSpace(req.InitiatorName),
		ScheduledAt:   scheduledAt,
		Location:      strings.TrimSpace(req.Location),
		Agenda:        req.Agenda,
		MeetingForm:   meetingForm,
		CreatedBy:     userID,
	})
	if err != nil {
		return nil, err
	}

	return toResponse(created), nil
}

func (s *Service) List(ctx context.Context, period string) ([]dto.MeetingResponse, error) {
	items, err := s.repo.List(ctx, period)
	if err != nil {
		return nil, err
	}

	result := make([]dto.MeetingResponse, 0, len(items))
	for _, item := range items {
		result = append(result, *toResponse(&item))
	}

	return result, nil
}

func toResponse(meeting *model.Meeting) *dto.MeetingResponse {
	return &dto.MeetingResponse{
		ID:            meeting.ID,
		InitiatorName: meeting.InitiatorName,
		ScheduledAt:   meeting.ScheduledAt,
		Location:      meeting.Location,
		Agenda:        meeting.Agenda,
		MeetingForm:   meeting.MeetingForm,
		CreatedBy:     meeting.CreatedBy,
		CreatedAt:     meeting.CreatedAt,
	}
}
