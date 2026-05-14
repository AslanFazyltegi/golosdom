package model

import "time"

const (
	StatusDraft            = "draft"
	StatusCouncilReview    = "council_review"
	StatusRevisionRequired = "revision_required"
	StatusPendingPublish   = "pending_publish"
	StatusPublished        = "published"

	ReviewInProgress      = "in_progress"
	ReviewApproved        = "approved"
	ReviewRevision        = "revision_required"
	ReviewNoMajority      = "no_majority"
	DecisionApprove       = "approve"
	DecisionRevision      = "revision"
	NoMajorityExplanation = "Не набрано большинство Совета дома до дедлайна"
)

type Voting struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	Status         string     `json:"status"`
	CreatedBy      string     `json:"created_by"`
	MeetingID      *string    `json:"meeting_id,omitempty"`
	Version        int        `json:"version"`
	ReviewDeadline *time.Time `json:"review_deadline,omitempty"`
	CreatedAt      *time.Time `json:"created_at,omitempty"`
	UpdatedAt      *time.Time `json:"updated_at,omitempty"`
	Meeting        *Meeting   `json:"meeting,omitempty"`
	Questions      []Question `json:"questions"`
}

type Meeting struct {
	ID            string    `json:"id"`
	InitiatorName string    `json:"initiator_name"`
	ScheduledAt   time.Time `json:"scheduled_at"`
	Location      string    `json:"location"`
	Agenda        []string  `json:"agenda"`
	MeetingForm   string    `json:"meeting_form"`
}

type Question struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Options []string `json:"options"`
}

type ApprovalReview struct {
	ID                    string         `json:"id"`
	VotingID              string         `json:"voting_id"`
	Version               int            `json:"version"`
	Status                string         `json:"status"`
	Deadline              time.Time      `json:"deadline"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
	ApproveCount          int            `json:"approve_count"`
	RevisionCount         int            `json:"revision_count"`
	TotalCouncilMembers   int            `json:"total_council_members"`
	PendingCouncilMembers int            `json:"pending_council_members"`
	NoMajorityReason      string         `json:"no_majority_reason,omitempty"`
	Votes                 []ApprovalVote `json:"votes"`
}

type ApprovalVote struct {
	ID        string    `json:"id"`
	ReviewID  string    `json:"review_id"`
	VotingID  string    `json:"voting_id"`
	UserID    string    `json:"user_id"`
	Decision  string    `json:"decision"`
	Comment   string    `json:"comment,omitempty"`
	Reason    string    `json:"reason,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
