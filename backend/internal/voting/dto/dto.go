package dto

type CreateVotingRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Category    string   `json:"category"`
	Question    string   `json:"question"`
	Options     []string `json:"options"`
}

type SaveDraftRequest struct {
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Category    string            `json:"category"`
	MeetingID   *string           `json:"meeting_id"`
	Questions   []QuestionRequest `json:"questions"`
}

type QuestionRequest struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Options []string `json:"options"`
}

type ApprovalVoteRequest struct {
	Decision string `json:"decision"`
	Reason   string `json:"reason"`
	Comment  string `json:"comment"`
}

type SchedulePublicationRequest struct {
	StartAt           string `json:"start_at"`
	SendNotifications bool   `json:"send_notifications"`
}

type OwnerVoteAnswerRequest struct {
	QuestionID string `json:"question_id"`
	Answer     string `json:"answer"`
}

type OwnerVoteRequest struct {
	Answers         []OwnerVoteAnswerRequest `json:"answers"`
	SignatureMethod string                   `json:"signature_method"`
}
