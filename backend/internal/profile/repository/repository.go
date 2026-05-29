package repository

import (
	"context"
	"database/sql"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

type UserData struct {
	ID         string
	FullName   string
	Email      string
	Phone      *string
	ErcAccount *string
	Photo      *string
}

type OsiRow struct {
	OsiID             string
	OsiName           string
	OsiBIN            *string
	OsiAddress        *string
	ChairmanID        *string
	ChairmanFullName  *string
	ChairmanPhone     *string
	BuildingID        *string
	BuildingName      *string
	BuildingCity      *string
	BuildingDistrict  *string
	BuildingStreet    *string
	BuildingHouse     *string
	BuildingHousePart *string
}

func (r *Repository) GetUser(ctx context.Context, userID string) (UserData, error) {
	var user UserData
	var phone sql.NullString
	var ercAccount sql.NullString
	var photo sql.NullString

	err := r.db.QueryRow(
		ctx,
		`SELECT id, full_name, email, phone, erc_account, photo FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.FullName, &user.Email, &phone, &ercAccount, &photo)

	user.Phone = stringPtr(phone)
	user.ErcAccount = stringPtr(ercAccount)
	user.Photo = stringPtr(photo)

	return user, err
}

func (r *Repository) UpdateUser(
	ctx context.Context,
	userID string,
	fullName string,
	phone *string,
	ercAccount *string,
	photo *string,
) error {
	_, err := r.db.Exec(
		ctx,
		`
		UPDATE users
		SET
			full_name = $2,
			phone = $3,
			erc_account = $4,
			photo = $5
		WHERE id = $1
		`,
		userID,
		fullName,
		phone,
		ercAccount,
		photo,
	)

	return err
}

func (r *Repository) GetRoles(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(
		ctx,
		`
		SELECT r.code
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
		ORDER BY r.code
		`,
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

func (r *Repository) GetOsi(ctx context.Context, userID string) ([]OsiRow, error) {
	rows, err := r.db.Query(
		ctx,
		`
		WITH user_osi AS (
			SELECT DISTINCT o.id
			FROM property_owners po
			JOIN property p ON p.id = po.property_id
			JOIN building b ON b.id = p.building_id
			JOIN osi o ON o.id = b.osi_id
			WHERE po.user_id = $1
			  AND po.status = 'active'

			UNION

			SELECT o.id
			FROM osi o
			WHERE o.chairman_user_id = $1
		)
		SELECT
			o.id,
			o.name,
			o.bin,
			o.address,
			u.id,
			u.full_name,
			u.phone,
			b.id,
			b.building_name,
			b.city,
			b.district,
			b.street,
			b.house_number,
			b.house_fraction
		FROM user_osi uo
		JOIN osi o ON o.id = uo.id
		LEFT JOIN users u ON u.id = o.chairman_user_id
		LEFT JOIN building b ON b.osi_id = o.id
		ORDER BY o.name, b.building_name, b.id
		`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []OsiRow{}
	for rows.Next() {
		var item OsiRow
		var osiBIN sql.NullString
		var osiAddress sql.NullString
		var chairmanID sql.NullString
		var chairmanFullName sql.NullString
		var chairmanPhone sql.NullString
		var buildingID sql.NullString
		var buildingName sql.NullString
		var buildingCity sql.NullString
		var buildingDistrict sql.NullString
		var buildingStreet sql.NullString
		var buildingHouse sql.NullString
		var buildingHousePart sql.NullString

		if err := rows.Scan(
			&item.OsiID,
			&item.OsiName,
			&osiBIN,
			&osiAddress,
			&chairmanID,
			&chairmanFullName,
			&chairmanPhone,
			&buildingID,
			&buildingName,
			&buildingCity,
			&buildingDistrict,
			&buildingStreet,
			&buildingHouse,
			&buildingHousePart,
		); err != nil {
			return nil, err
		}

		item.OsiBIN = stringPtr(osiBIN)
		item.OsiAddress = stringPtr(osiAddress)
		item.ChairmanID = stringPtr(chairmanID)
		item.ChairmanFullName = stringPtr(chairmanFullName)
		item.ChairmanPhone = stringPtr(chairmanPhone)
		item.BuildingID = stringPtr(buildingID)
		item.BuildingName = stringPtr(buildingName)
		item.BuildingCity = stringPtr(buildingCity)
		item.BuildingDistrict = stringPtr(buildingDistrict)
		item.BuildingStreet = stringPtr(buildingStreet)
		item.BuildingHouse = stringPtr(buildingHouse)
		item.BuildingHousePart = stringPtr(buildingHousePart)

		result = append(result, item)
	}

	return result, rows.Err()
}

func stringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	return &value.String
}
