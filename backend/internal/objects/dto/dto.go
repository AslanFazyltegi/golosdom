package dto

type Building struct {
	ID string `json:"id"`

	City          string  `json:"city"`
	District      *string `json:"district"`
	BuildingName  *string `json:"building_name"`
	Street        string  `json:"street"`
	HouseNumber   string  `json:"house_number"`
	HouseFraction *string `json:"house_fraction"`
	ImageURL      *string `json:"image_url,omitempty"`

	FloorsCount    *int `json:"floors_count"`
	EntrancesCount *int `json:"entrances_count"`

	ApartmentsCount *int `json:"apartments_count"`
	CommercialCount *int `json:"commercial_units_count"`
	StorageCount    *int `json:"storerooms_count"`
	ParkingCount    *int `json:"parking_spaces_count"`
}

type BuildingResponse struct {
	Type string `json:"type"`

	City          string  `json:"city"`
	District      *string `json:"district"`
	BuildingName  *string `json:"building_name"`
	Street        string  `json:"street"`
	HouseNumber   string  `json:"house_number"`
	HouseFraction *string `json:"house_fraction"`

	FloorsCount    *int `json:"floors_count"`
	EntrancesCount *int `json:"entrances_count"`

	ApartmentsCount *int `json:"apartments_count"`
	CommercialCount *int `json:"commercial_units_count"`
	StorageCount    *int `json:"storerooms_count"`
	ParkingCount    *int `json:"parking_spaces_count"`
}

type PropertyResponse struct {
	Type string `json:"type"`

	PropertyType string `json:"property_type"`
	Number       string `json:"number"`

	Area float64 `json:"area"`

	Status string `json:"status"`
}

type DashboardResponse struct {
	Building         Building           `json:"building"`
	Statistics       BuildingStatistics `json:"statistics"`
	TypeDistribution []TypeDistribution `json:"typeDistribution"`
	RecentActions    []ActivityLog      `json:"recentActions"`
}

type BuildingStatistics struct {
	Apartments      int `json:"apartments"`
	Commercial      int `json:"commercial"`
	Storerooms      int `json:"storerooms"`
	Parking         int `json:"parking"`
	Entrances       int `json:"entrances"`
	Floors          int `json:"floors"`
	TotalProperties int `json:"totalProperties"`
	WithOwner       int `json:"withOwner"`
	WithoutOwner    int `json:"withoutOwner"`
	UniqueOwners    int `json:"uniqueOwners"`
}

type TypeDistribution struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

type ActivityLog struct {
	ID          string `json:"id"`
	Action      string `json:"action"`
	Description string `json:"description"`
	CreatedBy   string `json:"created_by,omitempty"`
	CreatedAt   string `json:"created_at"`
}

type OwnerInfo struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Phone      *string `json:"phone"`
	ErcAccount *string `json:"erc_account"`
}

type PropertyDashboardItem struct {
	ID       string     `json:"id"`
	Type     string     `json:"type"`
	Number   string     `json:"number"`
	Entrance *int       `json:"entrance"`
	Floor    *int       `json:"floor"`
	Area     *float64   `json:"area"`
	Status   string     `json:"status"`
	Owner    *OwnerInfo `json:"owner"`
}

type OwnerDashboardItem struct {
	ID              string                   `json:"id"`
	Name            string                   `json:"name"`
	Email           string                   `json:"email"`
	Phone           *string                  `json:"phone"`
	ErcAccount      *string                  `json:"erc_account"`
	PropertiesCount int                      `json:"properties_count"`
	Properties      []OwnerPropertyDashboard `json:"properties"`
}

type OwnerPropertyDashboard struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Number string `json:"number"`
}

type UserOption struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Phone      *string `json:"phone"`
	ErcAccount *string `json:"erc_account"`
}

type UpdateBuildingRequest struct {
	BuildingName         *string `json:"building_name"`
	City                 *string `json:"city"`
	District             *string `json:"district"`
	Street               *string `json:"street"`
	HouseNumber          *string `json:"house_number"`
	HouseFraction        *string `json:"house_fraction"`
	FloorsCount          *int    `json:"floors_count"`
	EntrancesCount       *int    `json:"entrances_count"`
	ApartmentsCount      *int    `json:"apartments_count"`
	CommercialUnitsCount *int    `json:"commercial_units_count"`
	StoreroomsCount      *int    `json:"storerooms_count"`
	ParkingSpacesCount   *int    `json:"parking_spaces_count"`
}

type UpdatePropertyRequest struct {
	Type     *string  `json:"type"`
	Number   *string  `json:"number"`
	Entrance *int     `json:"entrance"`
	Floor    *int     `json:"floor"`
	Area     *float64 `json:"area"`
	UserID   *string  `json:"user_id"`
}
