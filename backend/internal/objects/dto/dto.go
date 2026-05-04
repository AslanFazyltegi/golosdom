package dto

type BuildingResponse struct {
	Type string `json:"type"`

	City        string `json:"city"`
	District    string `json:"district"`
	Street      string `json:"street"`
	HouseNumber string `json:"house_number"`

	FloorsCount    int `json:"floors_count"`
	EntrancesCount int `json:"entrances_count"`

	ApartmentsCount int `json:"apartments_count"`
	CommercialCount int `json:"commercial_units_count"`
	StorageCount    int `json:"storerooms_count"`
	ParkingCount    int `json:"parking_spaces_count"`
}

type PropertyResponse struct {
	Type string `json:"type"`

	PropertyType string `json:"property_type"`
	Number       string `json:"number"`

	Area float64 `json:"area"`

	Status string `json:"status"`
}
