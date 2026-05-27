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
	return &Repository{
		db: db,
	}
}

type BuildingData struct {
	City          string
	District      *string
	BuildingName  *string
	Street        string
	HouseNumber   string
	HouseFraction *string

	FloorsCount    *int
	EntrancesCount *int

	ApartmentsCount *int
	CommercialCount *int
	StorageCount    *int
	ParkingCount    *int
}

func (r *Repository) GetBuilding(
	ctx context.Context,
) (BuildingData, error) {

	var building BuildingData
	var district sql.NullString
	var buildingName sql.NullString
	var houseFraction sql.NullString
	var floorsCount sql.NullInt64
	var entrancesCount sql.NullInt64
	var apartmentsCount sql.NullInt64
	var commercialCount sql.NullInt64
	var storageCount sql.NullInt64
	var parkingCount sql.NullInt64

	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			city,
			district,
			building_name,
			street,
			house_number,
			house_fraction,

			floors_count,
			entrances_count,

			apartments_count,
			commercial_units_count,
			storerooms_count,
			parking_spaces_count

		FROM building

		-- TODO: при поддержке нескольких ЖК выбирать building по связи пользователя с ОСИ/ЖК.
		ORDER BY created_at ASC
		LIMIT 1
		`,
	).Scan(
		&building.City,
		&district,
		&buildingName,
		&building.Street,
		&building.HouseNumber,
		&houseFraction,

		&floorsCount,
		&entrancesCount,

		&apartmentsCount,
		&commercialCount,
		&storageCount,
		&parkingCount,
	)

	building.District = stringPtr(district)
	building.BuildingName = stringPtr(buildingName)
	building.HouseFraction = stringPtr(houseFraction)
	building.FloorsCount = intPtr(floorsCount)
	building.EntrancesCount = intPtr(entrancesCount)
	building.ApartmentsCount = intPtr(apartmentsCount)
	building.CommercialCount = intPtr(commercialCount)
	building.StorageCount = intPtr(storageCount)
	building.ParkingCount = intPtr(parkingCount)

	return building, err
}

func stringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	return &value.String
}

func intPtr(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}

	result := int(value.Int64)

	return &result
}

type PropertyData struct {
	Type string

	Number string

	Area float64

	Status string
}

func (r *Repository) GetUserProperties(
	ctx context.Context,
	userID string,
) ([]PropertyData, error) {

	rows, err := r.db.Query(
		ctx,
		`
		SELECT
			p.type,
			p.number,
			p.area,
			p.status

		FROM property p

		JOIN property_owners po
			ON po.property_id = p.id

		WHERE po.user_id = $1

		ORDER BY p.type, p.number
		`,
		userID,
	)

	if err != nil {
		return nil, err
	}

	defer rows.Close()

	result := []PropertyData{}

	for rows.Next() {

		var item PropertyData

		if err := rows.Scan(
			&item.Type,
			&item.Number,
			&item.Area,
			&item.Status,
		); err != nil {

			return nil, err
		}

		result = append(result, item)
	}

	return result, rows.Err()
}
