package repository

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"

	"golosdom-backend/internal/meetings/model"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, meeting model.Meeting) (*model.Meeting, error) {
	agendaJSON, err := json.Marshal(meeting.Agenda)
	if err != nil {
		return nil, err
	}

	query := `
		insert into meetings (
			initiator_name,
			scheduled_at,
			location,
			agenda,
			status,
			meeting_form,
			created_by
		)
		values ($1, $2, $3, $4, $5, $6, $7)
		returning id, initiator_name, scheduled_at, location, agenda, status, meeting_form, created_by, created_at
	`

	var agendaRaw []byte
	created := &model.Meeting{}

	err = r.db.QueryRow(
		ctx,
		query,
		meeting.InitiatorName,
		meeting.ScheduledAt,
		meeting.Location,
		agendaJSON,
		meeting.Status,
		meeting.MeetingForm,
		meeting.CreatedBy,
	).Scan(
		&created.ID,
		&created.InitiatorName,
		&created.ScheduledAt,
		&created.Location,
		&agendaRaw,
		&created.Status,
		&created.MeetingForm,
		&created.CreatedBy,
		&created.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(agendaRaw, &created.Agenda); err != nil {
		return nil, err
	}

	return created, nil
}

func (r *Repository) List(ctx context.Context, status string) ([]model.Meeting, error) {
	query := `
		select id, initiator_name, scheduled_at, location, agenda, status, meeting_form, created_by, created_at
		from meetings
		where ($1 = '' or status = $1)
		order by scheduled_at asc
	`

	rows, err := r.db.Query(ctx, query, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	meetings := make([]model.Meeting, 0)

	for rows.Next() {
		var meeting model.Meeting
		var agendaRaw []byte

		if err := rows.Scan(
			&meeting.ID,
			&meeting.InitiatorName,
			&meeting.ScheduledAt,
			&meeting.Location,
			&agendaRaw,
			&meeting.Status,
			&meeting.MeetingForm,
			&meeting.CreatedBy,
			&meeting.CreatedAt,
		); err != nil {
			return nil, err
		}

		if err := json.Unmarshal(agendaRaw, &meeting.Agenda); err != nil {
			return nil, err
		}

		meetings = append(meetings, meeting)
	}

	return meetings, rows.Err()
}
