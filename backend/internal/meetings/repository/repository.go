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
			meeting_form,
			created_by
		)
		values ($1, $2, $3, $4, $5, $6)
		returning id, initiator_name, scheduled_at, location, agenda, meeting_form, created_by, created_at
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
		meeting.MeetingForm,
		meeting.CreatedBy,
	).Scan(
		&created.ID,
		&created.InitiatorName,
		&created.ScheduledAt,
		&created.Location,
		&agendaRaw,
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

func (r *Repository) List(ctx context.Context, period string) ([]model.Meeting, error) {
	query := `
		select id, initiator_name, scheduled_at, location, agenda, meeting_form, created_by, created_at
		from meetings
		where
			(
				$1 = ''
				or ($1 = 'active' and scheduled_at::date = current_date)
				or ($1 = 'upcoming' and scheduled_at::date > current_date)
				or ($1 = 'past' and scheduled_at::date < current_date)
			)
		order by
			case when $1 = 'past' then scheduled_at end desc,
			case when $1 <> 'past' then scheduled_at end asc
	`

	rows, err := r.db.Query(ctx, query, period)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	meetings := make([]model.Meeting, 0)

	for rows.Next() {
		var meeting model.Meeting
		var agendaRaw []byte

		err := rows.Scan(
			&meeting.ID,
			&meeting.InitiatorName,
			&meeting.ScheduledAt,
			&meeting.Location,
			&agendaRaw,
			&meeting.MeetingForm,
			&meeting.CreatedBy,
			&meeting.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		if err := json.Unmarshal(agendaRaw, &meeting.Agenda); err != nil {
			return nil, err
		}

		meetings = append(meetings, meeting)
	}

	return meetings, rows.Err()
}
