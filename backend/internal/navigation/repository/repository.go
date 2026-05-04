package repository

import (
	"context"

	"golosdom-backend/internal/navigation/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetMenuByRole(ctx context.Context, roleCode string) ([]model.NavigationItem, error) {
	rows, err := r.db.Query(ctx, `
		SELECT 
			ni.id,
			ni.code,
			ni.title,
			COALESCE(ni.icon, ''),
			ni.parent_id,
			ni.component,
			ni.sort_order,
			rnp.can_view,
			rnp.can_create,
			rnp.can_update,
			rnp.can_delete,
			rnp.is_default
		FROM role_navigation_permissions rnp
		JOIN roles r ON r.id = rnp.role_id
		JOIN navigation_items ni ON ni.id = rnp.navigation_item_id
		WHERE r.code = $1
		  AND rnp.can_view = true
		  AND ni.is_active = true
		ORDER BY 
			CASE WHEN ni.parent_id IS NULL THEN 0 ELSE 1 END,
			ni.sort_order ASC,
			ni.title ASC
	`, roleCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.NavigationItem{}

	for rows.Next() {
		var item model.NavigationItem

		if err := rows.Scan(
			&item.ID,
			&item.Code,
			&item.Title,
			&item.Icon,
			&item.ParentID,
			&item.Component,
			&item.SortOrder,
			&item.CanView,
			&item.CanCreate,
			&item.CanUpdate,
			&item.CanDelete,
			&item.IsDefault,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}
