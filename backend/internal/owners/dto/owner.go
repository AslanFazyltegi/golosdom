package dto

type OwnerResponse struct {
	ID             string `json:"id"`
	FullName       string `json:"full_name"`
	PropertyNumber string `json:"property_number"`
	Email          string `json:"email"`
	Phone          string `json:"phone"`
}

type OwnerSearchResponse struct {
	UserID     string   `json:"user_id"`
	Label      string   `json:"label"`
	Name       string   `json:"name"`
	Email      string   `json:"email"`
	Phone      string   `json:"phone"`
	Properties []string `json:"properties"`
}
