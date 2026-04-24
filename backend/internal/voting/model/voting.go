package model

type Voting struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	CreatedBy   string     `json:"created_by"`
	Questions   []Question `json:"questions"`
}

type Question struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Options []string `json:"options"`
}
