package dto

type UserResponse struct {
	ID       string  `json:"id"`
	FullName string  `json:"full_name"`
	Email    string  `json:"email"`
	Phone    *string `json:"phone"`
	Photo    *string `json:"photo"`
}

type UpdateProfileRequest struct {
	FullName *string `json:"full_name"`
	Phone    *string `json:"phone"`
	Photo    *string `json:"photo"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	RepeatPassword  string `json:"repeat_password"`
}

type ChairmanResponse struct {
	ID       *string `json:"id"`
	FullName *string `json:"full_name"`
	Phone    *string `json:"phone"`
}

type BuildingResponse struct {
	ID            string  `json:"id"`
	BuildingName  *string `json:"building_name"`
	City          string  `json:"city"`
	District      *string `json:"district"`
	Street        string  `json:"street"`
	HouseNumber   string  `json:"house_number"`
	HouseFraction *string `json:"house_fraction"`
}

type OsiResponse struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	BIN       *string            `json:"bin"`
	Address   *string            `json:"address"`
	Chairman  *ChairmanResponse  `json:"chairman"`
	Buildings []BuildingResponse `json:"buildings"`
}

type ProfileResponse struct {
	User       UserResponse  `json:"user"`
	ActiveRole string        `json:"active_role"`
	Roles      []string      `json:"roles"`
	Osi        []OsiResponse `json:"osi"`
}
