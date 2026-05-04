package model

type NavigationItem struct {
	ID        string
	Code      string
	Title     string
	Icon      string
	ParentID  *string
	Component string
	SortOrder int
	CanView   bool
	CanCreate bool
	CanUpdate bool
	CanDelete bool
	IsDefault bool
}
