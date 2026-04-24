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

func (r *Repository) AssignRole(ctx context.Context, userID string, roleCode string) error {
	var roleID string

	err := r.db.QueryRow(ctx,
		`SELECT id FROM roles WHERE code = $1`,
		roleCode,
	).Scan(&roleID)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(ctx,
		`INSERT INTO user_roles (id, user_id, role_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, role_id) DO NOTHING`,
		userID+"-"+roleCode,
		userID,
		roleID,
	)

	return err
}

func (r *Repository) GetUserRoles(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT r.code
		 FROM user_roles ur
		 JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = $1
		 ORDER BY r.code`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roles := []string{}

	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}

	return roles, rows.Err()
}
