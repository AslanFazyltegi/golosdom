package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"golosdom-backend/internal/owners/dto"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetOwners(ctx context.Context) ([]dto.OwnerResponse, error) {
	rows, err := r.db.Query(ctx, `
	select
		u.id,
		coalesce(u.full_name, u.email) as full_name,
		string_agg(p.number, ', ' order by p.number) as property_number
	from property_owners po
	join users u on u.id = po.user_id
	join property p on p.id = po.property_id
	where po.status = 'active'
	group by u.id, coalesce(u.full_name, u.email)
	order by full_name
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	owners := make([]dto.OwnerResponse, 0)

	for rows.Next() {
		var owner dto.OwnerResponse

		if err := rows.Scan(
			&owner.ID,
			&owner.FullName,
			&owner.PropertyNumber,
		); err != nil {
			return nil, err
		}

		owners = append(owners, owner)
	}

	return owners, rows.Err()
}
