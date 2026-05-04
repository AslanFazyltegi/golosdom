package repository

import (
	"context"

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
	City        string
	District    string
	Street      string
	HouseNumber string

	FloorsCount    int
	EntrancesCount int

	ApartmentsCount int
	CommercialCount int
	StorageCount    int
	ParkingCount    int
}

func (r *Repository) GetBuilding(
	ctx context.Context,
) (BuildingData, error) {

	var building BuildingData

	err := r.db.QueryRow(
		ctx,
		`
		SELECT
			city,
			district,
			street,
			house_number,

			floors_count,
			entrances_count,

			apartments_count,
			commercial_units_count,
			storerooms_count,
			parking_spaces_count

		FROM building

		LIMIT 1
		`,
	).Scan(
		&building.City,
		&building.District,
		&building.Street,
		&building.HouseNumber,

		&building.FloorsCount,
		&building.EntrancesCount,

		&building.ApartmentsCount,
		&building.CommercialCount,
		&building.StorageCount,
		&building.ParkingCount,
	)

	return building, err
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
