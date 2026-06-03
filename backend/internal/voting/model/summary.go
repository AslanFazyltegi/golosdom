package model

import "time"

type VotingSummaryFilter struct {
	Search              string
	MeetingDateFrom     string
	MeetingDateTo       string
	PublicationDateFrom string
	PublicationDateTo   string
	CompletionDateFrom  string
	CompletionDateTo    string
	Status              string
	Category            string
	Quorum              string
	Risk                string
}

type VotingSummaryResponse struct {
	KPI      VotingSummaryKPI       `json:"kpi"`
	Meetings []VotingSummaryMeeting `json:"meetings"`
}

type VotingSummaryKPI struct {
	TotalVotings     int `json:"total_votings"`
	ActiveVotings    int `json:"active_votings"`
	CompletedVotings int `json:"completed_votings"`
	QuorumReached    int `json:"quorum_reached"`
	QuorumMissing    int `json:"quorum_missing"`
	WithRisks        int `json:"with_risks"`
}

type VotingSummaryMeeting struct {
	ID           string                  `json:"id"`
	ScheduledAt  *time.Time              `json:"scheduled_at,omitempty"`
	Location     string                  `json:"location"`
	Initiator    string                  `json:"initiator"`
	MeetingForm  string                  `json:"meeting_form"`
	Agenda       []string                `json:"agenda"`
	VotingsCount int                     `json:"votings_count"`
	Votings      []VotingSummaryListItem `json:"votings"`
}

type VotingSummaryListItem struct {
	ID                    string     `json:"id"`
	Title                 string     `json:"title"`
	Version               int        `json:"version"`
	Category              string     `json:"category"`
	Status                string     `json:"status"`
	StatusLabel           string     `json:"status_label"`
	PublicationStartAt    *time.Time `json:"publication_start_at,omitempty"`
	PublicationEndAt      *time.Time `json:"publication_end_at,omitempty"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
	StoppedAt             *time.Time `json:"stopped_at,omitempty"`
	QuestionsCount        int        `json:"questions_count"`
	EligibleOwnersCount   int        `json:"eligible_owners_count"`
	VotedOwnersCount      int        `json:"voted_owners_count"`
	TotalPropertyVotes    int        `json:"total_property_votes"`
	VotedPropertyVotes    int        `json:"voted_property_votes"`
	NotVotedPropertyVotes int        `json:"not_voted_property_votes"`
	ParticipationPercent  float64    `json:"participation_percent"`
	QuorumRequiredVotes   int        `json:"quorum_required_votes"`
	HasQuorum             bool       `json:"has_quorum"`
	QuorumMissingVotes    int        `json:"quorum_missing_votes"`
	AcceptedQuestions     int        `json:"accepted_questions"`
	TotalQuestions        int        `json:"total_questions"`
	RiskLevel             string     `json:"risk_level"`
	RiskReasons           []string   `json:"risk_reasons"`
	Warnings              []string   `json:"warnings"`
}

type VotingSummaryDetail struct {
	Voting        VotingSummaryDetailHeader `json:"voting"`
	Overview      VotingSummaryOverview     `json:"overview"`
	Questions     []VotingQuestionSummary   `json:"questions"`
	Owners        []VotingOwnerSummary      `json:"owners"`
	NotVoted      []VotingNotVotedOwner     `json:"not_voted"`
	Properties    []VotingPropertyBreakdown `json:"properties"`
	Notifications VotingNotificationSummary `json:"notifications"`
	Documents     VotingDocumentsSummary    `json:"documents"`
	Procedure     VotingProcedureSummary    `json:"procedure"`
	ActionLog     []VotingActionLogItem     `json:"action_log"`
}

type VotingSummaryDetailHeader struct {
	ID                    string     `json:"id"`
	Title                 string     `json:"title"`
	Version               int        `json:"version"`
	Category              string     `json:"category"`
	Status                string     `json:"status"`
	StatusLabel           string     `json:"status_label"`
	MeetingID             string     `json:"meeting_id,omitempty"`
	MeetingLocation       string     `json:"meeting_location"`
	MeetingScheduledAt    *time.Time `json:"meeting_scheduled_at,omitempty"`
	PublicationStartAt    *time.Time `json:"publication_start_at,omitempty"`
	PublicationEndAt      *time.Time `json:"publication_end_at,omitempty"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
	StoppedAt             *time.Time `json:"stopped_at,omitempty"`
	QuestionsCount        int        `json:"questions_count"`
	EligibleOwnersCount   int        `json:"eligible_owners_count"`
	VotedOwnersCount      int        `json:"voted_owners_count"`
	NotVotedOwnersCount   int        `json:"not_voted_owners_count"`
	TotalPropertyVotes    int        `json:"total_property_votes"`
	VotedPropertyVotes    int        `json:"voted_property_votes"`
	NotVotedPropertyVotes int        `json:"not_voted_property_votes"`
	ParticipationPercent  float64    `json:"participation_percent"`
	QuorumRequiredVotes   int        `json:"quorum_required_votes"`
	HasQuorum             bool       `json:"has_quorum"`
	QuorumMissingVotes    int        `json:"quorum_missing_votes"`
	DaysLeft              *int       `json:"days_left,omitempty"`
	AcceptedQuestions     int        `json:"accepted_questions"`
	RejectedQuestions     int        `json:"rejected_questions"`
	RiskLevel             string     `json:"risk_level"`
	RiskReasons           []string   `json:"risk_reasons"`
	Warnings              []string   `json:"warnings"`
}

type VotingSummaryOverview struct {
	Participation         VotingOverviewMetric `json:"participation"`
	Quorum                VotingOverviewMetric `json:"quorum"`
	Timeline              VotingOverviewMetric `json:"timeline"`
	Decisions             VotingOverviewMetric `json:"decisions"`
	Documents             VotingOverviewMetric `json:"documents"`
	Problems              VotingOverviewMetric `json:"problems"`
	TotalPropertyVotes    int                  `json:"total_property_votes"`
	VotedPropertyVotes    int                  `json:"voted_property_votes"`
	NotVotedPropertyVotes int                  `json:"not_voted_property_votes"`
	ParticipationPercent  float64              `json:"participation_percent"`
}

type VotingOverviewMetric struct {
	Title string   `json:"title"`
	Value string   `json:"value"`
	Hint  string   `json:"hint"`
	State string   `json:"state"`
	Items []string `json:"items,omitempty"`
}

type VotingQuestionSummary struct {
	ID            string                        `json:"id"`
	Number        int                           `json:"number"`
	Text          string                        `json:"text"`
	ForVotes      int                           `json:"for_votes"`
	AgainstVotes  int                           `json:"against_votes"`
	AbstainVotes  int                           `json:"abstain_votes"`
	NotVotedVotes int                           `json:"not_voted_votes"`
	ForPercent    float64                       `json:"for_percent"`
	Result        string                        `json:"result"`
	Details       VotingQuestionAnswerBreakdown `json:"details"`
}

type VotingQuestionAnswerBreakdown struct {
	For     []VotingQuestionOwnerAnswer `json:"for"`
	Against []VotingQuestionOwnerAnswer `json:"against"`
	Abstain []VotingQuestionOwnerAnswer `json:"abstain"`
}

type VotingQuestionOwnerAnswer struct {
	OwnerID       string   `json:"owner_id"`
	OwnerName     string   `json:"owner_name"`
	PropertyVotes int      `json:"property_votes"`
	Properties    []string `json:"properties"`
}

type VotingOwnerSummary struct {
	OwnerID       string                `json:"owner_id"`
	OwnerName     string                `json:"owner_name"`
	Email         string                `json:"email"`
	Phone         string                `json:"phone"`
	Properties    []VotingOwnerProperty `json:"properties"`
	PropertyLabel string                `json:"property_label"`
	PropertyTypes string                `json:"property_types"`
	ErcAccounts   string                `json:"erc_accounts"`
	PropertyVotes int                   `json:"property_votes"`
	Status        string                `json:"status"`
	VotedAt       *time.Time            `json:"voted_at,omitempty"`
	Method        string                `json:"method"`
	Signature     VotingSignatureInfo   `json:"signature"`
	PDFStatus     string                `json:"pdf_status"`
	Answers       []VotingOwnerAnswer   `json:"answers"`
}

type VotingOwnerProperty struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`
	TypeLabel  string   `json:"type_label"`
	Number     string   `json:"number"`
	ErcAccount string   `json:"erc_account"`
	Share      *float64 `json:"share,omitempty"`
}

type VotingSignatureInfo struct {
	Status             string     `json:"status"`
	Method             string     `json:"method"`
	SignedAt           *time.Time `json:"signed_at,omitempty"`
	CertificateSubject string     `json:"certificate_subject,omitempty"`
	CertificateSerial  string     `json:"certificate_serial,omitempty"`
	DocumentHash       string     `json:"document_hash,omitempty"`
}

type VotingOwnerAnswer struct {
	QuestionID   string `json:"question_id"`
	QuestionText string `json:"question_text"`
	Answer       string `json:"answer"`
}

type VotingNotVotedOwner struct {
	OwnerID            string                `json:"owner_id"`
	OwnerName          string                `json:"owner_name"`
	Email              string                `json:"email"`
	Phone              string                `json:"phone"`
	Properties         []VotingOwnerProperty `json:"properties"`
	PropertyLabel      string                `json:"property_label"`
	PropertyTypes      string                `json:"property_types"`
	PropertyVotes      int                   `json:"property_votes"`
	NotificationStatus string                `json:"notification_status"`
	LastReminderAt     *time.Time            `json:"last_reminder_at,omitempty"`
}

type VotingPropertyBreakdown struct {
	Type                 string  `json:"type"`
	TypeLabel            string  `json:"type_label"`
	TotalObjects         int     `json:"total_objects"`
	EligibleObjects      int     `json:"eligible_objects"`
	VotedObjects         int     `json:"voted_objects"`
	NotVotedObjects      int     `json:"not_voted_objects"`
	ParticipationPercent float64 `json:"participation_percent"`
}

type VotingNotificationSummary struct {
	Sent           int                       `json:"sent"`
	Delivered      int                       `json:"delivered"`
	Read           int                       `json:"read"`
	Failed         int                       `json:"failed"`
	NoContacts     int                       `json:"no_contacts"`
	LastReminderAt *time.Time                `json:"last_reminder_at,omitempty"`
	Events         []VotingNotificationEvent `json:"events"`
}

type VotingNotificationEvent struct {
	Date       *time.Time `json:"date,omitempty"`
	Type       string     `json:"type"`
	Recipients int        `json:"recipients"`
	Delivered  int        `json:"delivered"`
	Read       int        `json:"read"`
	Failed     int        `json:"failed"`
}

type VotingDocumentsSummary struct {
	Items []VotingDocumentItem `json:"items"`
}

type VotingDocumentItem struct {
	Code        string `json:"code"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	Available   bool   `json:"available"`
	Description string `json:"description"`
}

type VotingProcedureSummary struct {
	Status string                 `json:"status"`
	Checks []VotingProcedureCheck `json:"checks"`
}

type VotingProcedureCheck struct {
	Code    string `json:"code"`
	Title   string `json:"title"`
	Status  string `json:"status"`
	Comment string `json:"comment"`
}

type VotingActionLogItem struct {
	ID        string     `json:"id"`
	Action    string     `json:"action"`
	ActorName string     `json:"actor_name"`
	ActorRole string     `json:"actor_role"`
	Details   string     `json:"details"`
	CreatedAt *time.Time `json:"created_at,omitempty"`
}
