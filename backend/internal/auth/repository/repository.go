package repository

import (
	"context"

	"golosdom-backend/internal/auth/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, user model.User) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO users (id, email, password, full_name)
		 VALUES ($1, $2, $3, $4)`,
		user.ID,
		user.Email,
		user.Password,
		user.FullName,
	)
	return err
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (model.User, error) {
	var user model.User

	err := r.db.QueryRow(ctx,
		`SELECT id, email, password, full_name FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Email, &user.Password, &user.FullName)

	return user, err
}

func (r *Repository) GetByID(ctx context.Context, id string) (model.User, error) {
	var user model.User

	err := r.db.QueryRow(ctx,
		`SELECT id, email, password, full_name FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Email, &user.Password, &user.FullName)

	return user, err
}
