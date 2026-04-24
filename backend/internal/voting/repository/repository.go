package repository

import (
	"context"
	"fmt"

	"golosdom-backend/internal/voting/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List(ctx context.Context) ([]model.Voting, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, title, description, status, created_by
		FROM votings
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	votings := []model.Voting{}

	for rows.Next() {
		var v model.Voting
		if err := rows.Scan(&v.ID, &v.Title, &v.Description, &v.Status, &v.CreatedBy); err != nil {
			return nil, err
		}

		questions, err := r.getQuestions(ctx, v.ID)
		if err != nil {
			return nil, err
		}

		v.Questions = questions
		votings = append(votings, v)
	}

	return votings, rows.Err()
}

func (r *Repository) Create(ctx context.Context, voting model.Voting) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO votings (id, title, description, status, created_by)
		VALUES ($1, $2, $3, $4, $5)
	`, voting.ID, voting.Title, voting.Description, voting.Status, voting.CreatedBy)
	if err != nil {
		return err
	}

	for _, q := range voting.Questions {
		_, err = tx.Exec(ctx, `
			INSERT INTO voting_questions (id, voting_id, text)
			VALUES ($1, $2, $3)
		`, q.ID, voting.ID, q.Text)
		if err != nil {
			return err
		}

		for i, option := range q.Options {
			optionID := fmt.Sprintf("%s-option-%d", q.ID, i+1)

			_, err = tx.Exec(ctx, `
				INSERT INTO voting_options (id, question_id, text)
				VALUES ($1, $2, $3)
			`, optionID, q.ID, option)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func (r *Repository) getQuestions(ctx context.Context, votingID string) ([]model.Question, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, text
		FROM voting_questions
		WHERE voting_id = $1
		ORDER BY created_at ASC
	`, votingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	questions := []model.Question{}

	for rows.Next() {
		var q model.Question
		if err := rows.Scan(&q.ID, &q.Text); err != nil {
			return nil, err
		}

		options, err := r.getOptions(ctx, q.ID)
		if err != nil {
			return nil, err
		}

		q.Options = options
		questions = append(questions, q)
	}

	return questions, rows.Err()
}

func (r *Repository) getOptions(ctx context.Context, questionID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT text
		FROM voting_options
		WHERE question_id = $1
		ORDER BY created_at ASC
	`, questionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	options := []string{}

	for rows.Next() {
		var option string
		if err := rows.Scan(&option); err != nil {
			return nil, err
		}
		options = append(options, option)
	}

	return options, rows.Err()
}
