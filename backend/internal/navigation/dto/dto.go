package dto

type MenuItemResponse struct {
	Code      string             `json:"code"`
	Title     string             `json:"title"`
	Icon      string             `json:"icon"`
	Component string             `json:"component"`
	CanView   bool               `json:"can_view"`
	CanCreate bool               `json:"can_create"`
	CanUpdate bool               `json:"can_update"`
	CanDelete bool               `json:"can_delete"`
	IsDefault bool               `json:"is_default"`
	Children  []MenuItemResponse `json:"children"`
}
