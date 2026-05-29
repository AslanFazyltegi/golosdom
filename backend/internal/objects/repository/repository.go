package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

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
	ID string

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
			id,
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
		&building.ID,
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

func (r *Repository) GetDashboard(ctx context.Context) (BuildingData, BuildingStatisticsData, []TypeDistributionData, []ActivityLogData, error) {
	building, err := r.GetBuilding(ctx)
	if err != nil {
		return BuildingData{}, BuildingStatisticsData{}, nil, nil, err
	}

	stats, err := r.GetStatistics(ctx, building.ID)
	if err != nil {
		return BuildingData{}, BuildingStatisticsData{}, nil, nil, err
	}

	distribution, err := r.GetTypeDistribution(ctx, building.ID)
	if err != nil {
		return BuildingData{}, BuildingStatisticsData{}, nil, nil, err
	}

	actions, err := r.GetRecentActions(ctx, building.ID)
	if err != nil {
		actions = []ActivityLogData{}
	}

	return building, stats, distribution, actions, nil
}

type BuildingStatisticsData struct {
	Apartments      int
	Commercial      int
	Storerooms      int
	Parking         int
	Entrances       int
	Floors          int
	TotalProperties int
	WithOwner       int
	WithoutOwner    int
	UniqueOwners    int
}

func (r *Repository) GetStatistics(ctx context.Context, buildingID string) (BuildingStatisticsData, error) {
	var stats BuildingStatisticsData

	err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(b.apartments_count, 0),
			COALESCE(b.commercial_units_count, 0),
			COALESCE(b.storerooms_count, 0),
			COALESCE(b.parking_spaces_count, 0),
			COALESCE(b.entrances_count, 0),
			COALESCE(b.floors_count, 0),
			COUNT(DISTINCT p.id),
			COUNT(DISTINCT p.id) FILTER (WHERE po.user_id IS NOT NULL),
			COUNT(DISTINCT p.id) FILTER (WHERE po.user_id IS NULL),
			COUNT(DISTINCT po.user_id)
		FROM building b
		LEFT JOIN property p
			ON p.building_id = b.id
		LEFT JOIN property_owners po
			ON po.property_id = p.id
			AND po.status = 'active'
			AND po.is_primary = true
		WHERE b.id = $1
		GROUP BY
			b.apartments_count,
			b.commercial_units_count,
			b.storerooms_count,
			b.parking_spaces_count,
			b.entrances_count,
			b.floors_count
	`, buildingID).Scan(
		&stats.Apartments,
		&stats.Commercial,
		&stats.Storerooms,
		&stats.Parking,
		&stats.Entrances,
		&stats.Floors,
		&stats.TotalProperties,
		&stats.WithOwner,
		&stats.WithoutOwner,
		&stats.UniqueOwners,
	)

	return stats, err
}

type TypeDistributionData struct {
	Type  string
	Count int
}

func (r *Repository) GetTypeDistribution(ctx context.Context, buildingID string) ([]TypeDistributionData, error) {
	rows, err := r.db.Query(ctx, `
		SELECT type, COUNT(*)
		FROM property
		WHERE building_id = $1
		GROUP BY type
		ORDER BY type
	`, buildingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []TypeDistributionData{}
	for rows.Next() {
		var item TypeDistributionData
		if err := rows.Scan(&item.Type, &item.Count); err != nil {
			return nil, err
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

type ActivityLogData struct {
	ID          string
	Action      string
	Description string
	CreatedBy   sql.NullString
	CreatedAt   time.Time
}

func (r *Repository) GetRecentActions(ctx context.Context, buildingID string) ([]ActivityLogData, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, action, description, created_by, created_at
		FROM building_activity_logs
		WHERE building_id = $1
		ORDER BY created_at DESC
		LIMIT 5
	`, buildingID)
	if err != nil {
		if strings.Contains(err.Error(), "building_activity_logs") {
			return []ActivityLogData{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	result := []ActivityLogData{}
	for rows.Next() {
		var item ActivityLogData
		if err := rows.Scan(&item.ID, &item.Action, &item.Description, &item.CreatedBy, &item.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

func (r *Repository) LogAction(ctx context.Context, buildingID, entityType, entityID, action, description, createdBy string) {
	_, _ = r.db.Exec(ctx, `
		INSERT INTO building_activity_logs (
			id,
			building_id,
			entity_type,
			entity_id,
			action,
			description,
			created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, fmt.Sprintf("activity-%d", time.Now().UnixNano()), buildingID, entityType, entityID, action, description, createdBy)
}

type PropertyDashboardData struct {
	ID string

	Type     string
	Number   string
	Entrance sql.NullInt64
	Floor    sql.NullInt64
	Area     sql.NullFloat64
	Status   string

	OwnerID         sql.NullString
	OwnerName       sql.NullString
	OwnerEmail      sql.NullString
	OwnerPhone      sql.NullString
	OwnerErcAccount sql.NullString
}

func (r *Repository) GetBuildingProperties(ctx context.Context, buildingID string) ([]PropertyDashboardData, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.type,
			p.number,
			p.entrance,
			p.floor,
			p.area,
			p.status,
			u.id,
			u.full_name,
			u.email,
			u.phone,
			u.erc_account
		FROM property p
		LEFT JOIN property_owners po
			ON po.property_id = p.id
			AND po.status = 'active'
			AND po.is_primary = true
		LEFT JOIN users u
			ON u.id = po.user_id
		WHERE p.building_id = $1
		ORDER BY p.type, length(p.number), p.number
	`, buildingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []PropertyDashboardData{}
	for rows.Next() {
		var item PropertyDashboardData
		if err := rows.Scan(
			&item.ID,
			&item.Type,
			&item.Number,
			&item.Entrance,
			&item.Floor,
			&item.Area,
			&item.Status,
			&item.OwnerID,
			&item.OwnerName,
			&item.OwnerEmail,
			&item.OwnerPhone,
			&item.OwnerErcAccount,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

type OwnerDashboardData struct {
	ID              string
	Name            string
	Email           string
	Phone           sql.NullString
	ErcAccount      sql.NullString
	PropertiesCount int
	Properties      []OwnerPropertyData
}

type OwnerPropertyData struct {
	ID     string
	Type   string
	Number string
}

func (r *Repository) GetBuildingOwners(ctx context.Context, buildingID string) ([]OwnerDashboardData, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id,
			COALESCE(NULLIF(u.full_name, ''), u.email) AS owner_name,
			u.email,
			u.phone,
			u.erc_account,
			p.id,
			p.type,
			p.number
		FROM property p
		JOIN property_owners po
			ON po.property_id = p.id
			AND po.status = 'active'
			AND po.is_primary = true
		JOIN users u
			ON u.id = po.user_id
		WHERE p.building_id = $1
		ORDER BY owner_name, p.type, length(p.number), p.number
	`, buildingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byID := map[string]*OwnerDashboardData{}
	order := []string{}

	for rows.Next() {
		var ownerID, name, email string
		var phone, erc sql.NullString
		var property OwnerPropertyData
		if err := rows.Scan(&ownerID, &name, &email, &phone, &erc, &property.ID, &property.Type, &property.Number); err != nil {
			return nil, err
		}

		owner, exists := byID[ownerID]
		if !exists {
			owner = &OwnerDashboardData{
				ID:         ownerID,
				Name:       name,
				Email:      email,
				Phone:      phone,
				ErcAccount: erc,
				Properties: []OwnerPropertyData{},
			}
			byID[ownerID] = owner
			order = append(order, ownerID)
		}

		owner.Properties = append(owner.Properties, property)
		owner.PropertiesCount = len(owner.Properties)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := []OwnerDashboardData{}
	for _, id := range order {
		result = append(result, *byID[id])
	}

	return result, nil
}

type UserOptionData struct {
	ID         string
	Name       string
	Email      string
	Phone      sql.NullString
	ErcAccount sql.NullString
}

func (r *Repository) GetUsers(ctx context.Context) ([]UserOptionData, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			COALESCE(NULLIF(full_name, ''), email) AS name,
			email,
			phone,
			erc_account
		FROM users
		ORDER BY name, email
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []UserOptionData{}
	for rows.Next() {
		var item UserOptionData
		if err := rows.Scan(&item.ID, &item.Name, &item.Email, &item.Phone, &item.ErcAccount); err != nil {
			return nil, err
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

type BuildingUpdateData struct {
	BuildingName         *string
	City                 *string
	District             *string
	Street               *string
	HouseNumber          *string
	HouseFraction        *string
	FloorsCount          *int
	EntrancesCount       *int
	ApartmentsCount      *int
	CommercialUnitsCount *int
	StoreroomsCount      *int
	ParkingSpacesCount   *int
}

func (r *Repository) UpdateBuilding(ctx context.Context, buildingID string, data BuildingUpdateData) (BuildingData, error) {
	_, err := r.db.Exec(ctx, `
		UPDATE building
		SET
			building_name = $2,
			city = $3,
			district = $4,
			street = $5,
			house_number = $6,
			house_fraction = $7,
			floors_count = $8,
			entrances_count = $9,
			apartments_count = $10,
			commercial_units_count = $11,
			storerooms_count = $12,
			parking_spaces_count = $13
		WHERE id = $1
	`, buildingID, data.BuildingName, data.City, data.District, data.Street, data.HouseNumber, data.HouseFraction, data.FloorsCount, data.EntrancesCount, data.ApartmentsCount, data.CommercialUnitsCount, data.StoreroomsCount, data.ParkingSpacesCount)
	if err != nil {
		return BuildingData{}, err
	}

	return r.GetBuilding(ctx)
}

type PropertyUpdateData struct {
	Type     *string
	Number   *string
	Entrance *int
	Floor    *int
	Area     *float64
	UserID   *string
}

func (r *Repository) UpdateProperty(ctx context.Context, buildingID, propertyID string, data PropertyUpdateData) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE property
		SET
			type = $3,
			number = $4,
			entrance = $5,
			floor = $6,
			area = $7
		WHERE id = $1
			AND building_id = $2
	`, propertyID, buildingID, data.Type, data.Number, data.Entrance, data.Floor, data.Area)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return sql.ErrNoRows
	}

	if data.UserID == nil || strings.TrimSpace(*data.UserID) == "" {
		_, err = tx.Exec(ctx, `
			DELETE FROM property_owners
			WHERE property_id = $1
				AND status = 'active'
				AND is_primary = true
		`, propertyID)
	} else {
		userID := strings.TrimSpace(*data.UserID)
		tag, err = tx.Exec(ctx, `
			UPDATE property_owners
			SET user_id = $2
			WHERE property_id = $1
				AND status = 'active'
				AND is_primary = true
		`, propertyID, userID)
		if err == nil && tag.RowsAffected() == 0 {
			_, err = tx.Exec(ctx, `
				INSERT INTO property_owners (
					id,
					property_id,
					user_id,
					ownership_share,
					is_primary,
					status
				) VALUES ($1, $2, $3, 100.00, true, 'active')
			`, fmt.Sprintf("owner-%s-%d", propertyID, time.Now().UnixNano()), propertyID, userID)
		}
	}
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
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

type MyPropertyData struct {
	ID             string
	Type           string
	Number         string
	Area           sql.NullFloat64
	Status         string
	ErcAccount     sql.NullString
	ImageURL       sql.NullString
	Floor          sql.NullInt64
	Entrance       sql.NullInt64
	Share          sql.NullFloat64
	PayerStatus    string
	PayerUpdatedAt sql.NullTime
	BuildingID     string
	BuildingName   sql.NullString
	City           string
	District       sql.NullString
	Street         string
	HouseNumber    string
	HouseFraction  sql.NullString
	PayerName      sql.NullString
}

type CreatePropertyUpdateRequestData struct {
	PropertyID  string
	UserID      string
	RequestType string
	NewValue    *string
	Comment     *string
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

func (r *Repository) GetMyProperties(ctx context.Context, userID string) ([]MyPropertyData, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			p.id,
			p.type,
			p.number,
			p.area,
			p.status,
			p.erc_account,
			p.image_url,
			p.floor,
			p.entrance,
			po.ownership_share,
			COALESCE(NULLIF(po.payer_status, ''), 'confirmed'),
			po.payer_updated_at,
			b.id,
			b.building_name,
			b.city,
			b.district,
			b.street,
			b.house_number,
			b.house_fraction,
			u.full_name
		FROM property_owners po
		JOIN property p
			ON p.id = po.property_id
		JOIN building b
			ON b.id = p.building_id
		JOIN users u
			ON u.id = po.user_id
		WHERE po.user_id = $1
			AND po.status = 'active'
		ORDER BY p.type, length(p.number), p.number
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []MyPropertyData{}
	for rows.Next() {
		var item MyPropertyData
		if err := rows.Scan(
			&item.ID,
			&item.Type,
			&item.Number,
			&item.Area,
			&item.Status,
			&item.ErcAccount,
			&item.ImageURL,
			&item.Floor,
			&item.Entrance,
			&item.Share,
			&item.PayerStatus,
			&item.PayerUpdatedAt,
			&item.BuildingID,
			&item.BuildingName,
			&item.City,
			&item.District,
			&item.Street,
			&item.HouseNumber,
			&item.HouseFraction,
			&item.PayerName,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

func (r *Repository) CountActiveVotingsForOwner(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM votings v
		WHERE v.status = 'published'
			AND COALESCE(v.publication_status, 'not_scheduled') = 'published'
			AND v.publication_start_at IS NOT NULL
			AND v.publication_end_at IS NOT NULL
			AND v.publication_start_at <= now()
			AND v.publication_end_at >= now()
			AND (
				COALESCE(NULLIF(v.category, ''), 'general') = 'general'
				OR (
					v.category = 'apartments_and_commercial'
					AND EXISTS (
						SELECT 1
						FROM property_owners po
						JOIN property p ON p.id = po.property_id
						WHERE po.user_id = $1
							AND po.status = 'active'
							AND p.type IN ('apartment', 'commercial', 'commercial_room', 'commercial_unit')
					)
				)
				OR (
					v.category = 'parking_and_storerooms'
					AND EXISTS (
						SELECT 1
						FROM property_owners po
						JOIN property p ON p.id = po.property_id
						WHERE po.user_id = $1
							AND po.status = 'active'
							AND p.type IN ('parking', 'parking_space', 'storeroom', 'storage')
					)
				)
			)
	`, userID).Scan(&count)
	return count, err
}

func (r *Repository) CreatePropertyUpdateRequest(ctx context.Context, data CreatePropertyUpdateRequestData) (string, time.Time, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", time.Time{}, err
	}
	defer tx.Rollback(ctx)

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM property_owners
			WHERE property_id = $1
				AND user_id = $2
				AND status = 'active'
		)
	`, data.PropertyID, data.UserID).Scan(&exists); err != nil {
		return "", time.Time{}, err
	}
	if !exists {
		return "", time.Time{}, sql.ErrNoRows
	}

	id := fmt.Sprintf("property-request-%s-%d", data.PropertyID, time.Now().UnixNano())
	var createdAt time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO property_update_requests (
			id,
			property_id,
			user_id,
			request_type,
			new_value,
			comment,
			status
		) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
		RETURNING created_at
	`, id, data.PropertyID, data.UserID, data.RequestType, data.NewValue, data.Comment).Scan(&createdAt); err != nil {
		return "", time.Time{}, err
	}

	return id, createdAt, tx.Commit(ctx)
}
