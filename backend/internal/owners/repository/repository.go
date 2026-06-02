package repository

import (
	"context"
	"strings"

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
		string_agg(p.number, ', ' order by p.number) as property_number,
		u.email,
		coalesce(u.phone, '') as phone
	from property_owners po
	join users u on u.id = po.user_id
	join property p on p.id = po.property_id
	where po.status = 'active'
	group by u.id, coalesce(u.full_name, u.email), u.email, u.phone
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
			&owner.Email,
			&owner.Phone,
		); err != nil {
			return nil, err
		}

		owners = append(owners, owner)
	}

	return owners, rows.Err()
}

func (r *Repository) SearchOwners(ctx context.Context, query string) ([]dto.OwnerSearchResponse, error) {
	query = strings.TrimSpace(query)
	like := "%" + strings.ToLower(query) + "%"
	rows, err := r.db.Query(ctx, `
		WITH owner_rows AS (
			SELECT
				u.id,
				COALESCE(NULLIF(u.full_name, ''), u.email) AS name,
				u.email,
				COALESCE(u.phone, '') AS phone,
				array_agg(DISTINCT p.number ORDER BY p.number) AS properties,
				MIN(CASE
					WHEN lower(COALESCE(NULLIF(u.full_name, ''), u.email)) = lower($1) THEN 1
					WHEN lower(u.email) = lower($1) THEN 2
					WHEN lower(COALESCE(u.phone, '')) = lower($1) THEN 3
					WHEN EXISTS (
						SELECT 1
						FROM property_owners po2
						JOIN property p2 ON p2.id = po2.property_id
						WHERE po2.user_id = u.id
							AND po2.status = 'active'
							AND lower(p2.number) = lower($1)
					) THEN 4
					ELSE 10
				END) AS rank
			FROM property_owners po
			JOIN users u ON u.id = po.user_id
			JOIN property p ON p.id = po.property_id
			WHERE po.status = 'active'
				AND (
					$1 = ''
					OR lower(COALESCE(NULLIF(u.full_name, ''), u.email)) LIKE $2
					OR lower(u.email) LIKE $2
					OR lower(COALESCE(u.phone, '')) LIKE $2
					OR lower(p.number) LIKE $2
				)
			GROUP BY u.id, COALESCE(NULLIF(u.full_name, ''), u.email), u.email, u.phone
		)
		SELECT id, name, email, phone, properties
		FROM owner_rows
		ORDER BY rank, name
		LIMIT 20
	`, query, like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	owners := []dto.OwnerSearchResponse{}
	for rows.Next() {
		var owner dto.OwnerSearchResponse
		if err := rows.Scan(&owner.UserID, &owner.Name, &owner.Email, &owner.Phone, &owner.Properties); err != nil {
			return nil, err
		}
		owner.Label = owner.Name + " (" + strings.Join(owner.Properties, ", ") + ")"
		owners = append(owners, owner)
	}
	return owners, rows.Err()
}
