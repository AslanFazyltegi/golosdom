package model

type User struct {
	ID       string   `json:"id"`
	Email    string   `json:"email"`
	Password string   `json:"-"`
	FullName string   `json:"full_name"`
	Roles    []string `json:"roles"`
}
