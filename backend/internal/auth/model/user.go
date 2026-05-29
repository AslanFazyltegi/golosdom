package model

type User struct {
	ID       string   `json:"id"`
	Email    string   `json:"email"`
	Password string   `json:"-"`
	FullName string   `json:"full_name"`
	Phone    *string  `json:"phone"`
	Photo    *string  `json:"photo"`
	Roles    []string `json:"roles"`
}
