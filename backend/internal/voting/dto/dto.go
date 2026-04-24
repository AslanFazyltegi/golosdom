package dto

type CreateVotingRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Question    string   `json:"question"`
	Options     []string `json:"options"`
}
