export type VotingQuestion = {
  id: string;
  text: string;
  options?: string[] | null;
};

export type VotingCategory =
  | "general"
  | "apartments_and_commercial"
  | "parking_and_storerooms";

export type VotingAnswerValue = "for" | "against" | "abstain";

export type VotingSignatureMock = "MOCK_MGOV" | "MOCK_ECP";

export type VotingMeeting = {
  id: string;
  initiator_name: string;
  scheduled_at: string;
  location: string;
  agenda: string[];
  meeting_form: string;
};

export type Voting = {
  id: string;
  title: string;
  description: string;
  category?: VotingCategory | null;
  status: string;
  created_by: string;
  meeting_id?: string | null;
  version?: number | null;
  review_deadline?: string | null;
  publication_start_at?: string | null;
  publication_end_at?: string | null;
  publication_send_notifications?: boolean;
  publication_scheduled_at?: string | null;
  publication_status?: string | null;
  published_at?: string | null;
  min_stop_at?: string | null;
  can_stop?: boolean;
  stop_available_at?: string | null;
  stop_block_reason?: string | null;
  stopped_at?: string | null;
  completed_at?: string | null;
  expired_at?: string | null;
  completion_reason?: string | null;
  completion_type?: "manual_stop" | "deadline_expired" | string | null;
  total_owners_count?: number;
  voted_owners_count?: number;
  user_has_voted?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  meeting?: VotingMeeting | null;
  questions?: VotingQuestion[] | null;
};

export type VotingApprovalVote = {
  id: string;
  review_id: string;
  voting_id: string;
  user_id: string;
  decision: "approve" | "revision";
  comment?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
};

export type VotingApprovalReview = {
  id: string;
  voting_id: string;
  version?: number | null;
  status: "in_progress" | "approved" | "revision_required" | "no_majority";
  deadline: string;
  created_at?: string;
  updated_at?: string;
  approve_count: number;
  revision_count: number;
  total_council_members: number;
  pending_council_members: number;
  no_majority_reason?: string;
  votes?: VotingApprovalVote[] | null;
};

export type VotingDraftPayload = {
  title: string;
  description: string;
  category: VotingCategory;
  meeting_id?: string | null;
  questions: Array<{
    id: string;
    text: string;
    options: string[];
  }>;
};

export type VotingCouncilSubmitPayload = VotingDraftPayload & {
  meeting_id: string | null;
};

export type VotingSavePayload = VotingDraftPayload | VotingCouncilSubmitPayload;

export type VotingPublicationSchedulePayload = {
  start_at: string;
  send_notifications: boolean;
};

export type StopVotingPayload = {
  reason: string;
};

export type VotingResult = {
  question_id: string;
  question_text: string;
  for_count: number;
  against_count: number;
  abstain_count: number;
  total_count: number;
};

export type OwnerVotingAnswer = {
  id?: string;
  voting_id: string;
  question_id: string;
  question_text: string;
  answer: VotingAnswerValue;
  signature_method?: VotingSignatureMock | string;
  signature_status?: "signed" | string;
  signed_at?: string | null;
  created_at?: string | null;
};

export type OwnerVotingSubmission = {
  answers: Array<{
    question_id: string;
    answer: VotingAnswerValue;
  }>;
  signature_method: VotingSignatureMock;
};

export type OwnerBatchVotingSubmission = {
  meeting_id: string;
  voting_ids: string[];
  answers: Array<{
    voting_id: string;
    answers: Array<{
      question_id: string;
      answer: VotingAnswerValue;
    }>;
  }>;
  signature_method: VotingSignatureMock;
};

export type VotingStatus =
  | "draft"
  | "council_review"
  | "revision_required"
  | "pending_publish"
  | "published"
  | "stopped"
  | "completed"
  | "expired";

export type VotingSummaryStatus = "active" | "completed" | "stopped";
export type VotingSummaryRisk = "low" | "medium" | "high";
export type VotingSummaryQuestionResult =
  | "accepted"
  | "rejected"
  | "not_enough_votes"
  | "needs_review";

export type VotingSummaryResponse = {
  kpi: VotingSummaryKPI;
  meetings: VotingSummaryMeeting[];
};

export type VotingSummaryKPI = {
  total_votings: number;
  active_votings: number;
  completed_votings: number;
  quorum_reached: number;
  quorum_missing: number;
  with_risks: number;
};

export type VotingSummaryMeeting = {
  id: string;
  scheduled_at?: string | null;
  location: string;
  initiator: string;
  meeting_form: string;
  agenda: string[];
  votings_count: number;
  votings: VotingSummaryListItem[];
};

export type VotingSummaryListItem = {
  id: string;
  title: string;
  version: number;
  category: VotingCategory;
  status: VotingSummaryStatus;
  status_label: string;
  publication_start_at?: string | null;
  publication_end_at?: string | null;
  completed_at?: string | null;
  stopped_at?: string | null;
  questions_count: number;
  eligible_owners_count: number;
  voted_owners_count: number;
  total_property_votes: number;
  voted_property_votes: number;
  not_voted_property_votes: number;
  participation_percent: number;
  quorum_required_votes: number;
  has_quorum: boolean;
  quorum_missing_votes: number;
  accepted_questions: number;
  total_questions: number;
  signed_owners_count?: number;
  pdf_formed_owners_count?: number;
  risk_level: VotingSummaryRisk;
  risk_reasons: string[];
  warnings: string[];
};

export type VotingSummaryDetail = {
  voting: VotingSummaryDetailHeader;
  overview: VotingSummaryOverview;
  questions: VotingQuestionSummary[];
  owners: VotingOwnerSummary[];
  not_voted: VotingNotVotedOwner[];
  properties: VotingPropertyBreakdown[];
  notifications: VotingNotificationSummary;
  documents: VotingDocumentsSummary;
  procedure: VotingProcedureSummary;
  action_log: VotingActionLogItem[];
};

export type VotingSummaryDetailHeader = {
  id: string;
  title: string;
  version: number;
  category: VotingCategory;
  status: VotingSummaryStatus;
  status_label: string;
  meeting_id?: string;
  meeting_location: string;
  meeting_scheduled_at?: string | null;
  publication_start_at?: string | null;
  publication_end_at?: string | null;
  completed_at?: string | null;
  stopped_at?: string | null;
  questions_count: number;
  eligible_owners_count: number;
  voted_owners_count: number;
  not_voted_owners_count: number;
  total_property_votes: number;
  voted_property_votes: number;
  not_voted_property_votes: number;
  participation_percent: number;
  quorum_required_votes: number;
  has_quorum: boolean;
  quorum_missing_votes: number;
  days_left?: number | null;
  accepted_questions: number;
  rejected_questions: number;
  risk_level: VotingSummaryRisk;
  risk_reasons: string[];
  warnings: string[];
};

export type VotingSummaryOverview = {
  participation: VotingOverviewMetric;
  quorum: VotingOverviewMetric;
  timeline: VotingOverviewMetric;
  decisions: VotingOverviewMetric;
  documents: VotingOverviewMetric;
  problems: VotingOverviewMetric;
  total_property_votes: number;
  voted_property_votes: number;
  not_voted_property_votes: number;
  participation_percent: number;
};

export type VotingOverviewMetric = {
  title: string;
  value: string;
  hint: string;
  state: string;
  items?: string[];
};

export type VotingQuestionSummary = {
  id: string;
  number: number;
  text: string;
  for_votes: number;
  against_votes: number;
  abstain_votes: number;
  not_voted_votes: number;
  for_percent: number;
  result: VotingSummaryQuestionResult;
  details: VotingQuestionAnswerBreakdown;
};

export type VotingQuestionAnswerBreakdown = {
  for: VotingQuestionOwnerAnswer[];
  against: VotingQuestionOwnerAnswer[];
  abstain: VotingQuestionOwnerAnswer[];
};

export type VotingQuestionOwnerAnswer = {
  owner_id: string;
  owner_name: string;
  property_votes: number;
  properties: string[];
};

export type VotingOwnerSummary = {
  owner_id: string;
  owner_name: string;
  email: string;
  phone: string;
  properties: VotingOwnerProperty[];
  property_label: string;
  property_types: string;
  erc_accounts: string;
  property_votes: number;
  status: "voted" | "not_voted";
  voted_at?: string | null;
  method: string;
  signature: VotingSignatureInfo;
  pdf_status: "formed" | "not_formed" | string;
  answers: VotingOwnerAnswer[];
};

export type VotingOwnerProperty = {
  id: string;
  type: string;
  type_label: string;
  number: string;
  erc_account: string;
  share?: number | null;
};

export type VotingSignatureInfo = {
  status: "signed" | "error" | "none" | "not_required" | string;
  method: string;
  signed_at?: string | null;
  certificate_subject?: string;
  certificate_serial?: string;
  document_hash?: string;
};

export type VotingOwnerAnswer = {
  question_id: string;
  question_text: string;
  answer: VotingAnswerValue;
};

export type VotingNotVotedOwner = {
  owner_id: string;
  owner_name: string;
  email: string;
  phone: string;
  properties: VotingOwnerProperty[];
  property_label: string;
  property_types: string;
  property_votes: number;
  notification_status: string;
  last_reminder_at?: string | null;
};

export type VotingPropertyBreakdown = {
  type: string;
  type_label: string;
  total_objects: number;
  eligible_objects: number;
  voted_objects: number;
  not_voted_objects: number;
  participation_percent: number;
};

export type VotingNotificationSummary = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  no_contacts: number;
  last_reminder_at?: string | null;
  events: VotingNotificationEvent[];
};

export type VotingNotificationEvent = {
  date?: string | null;
  type: string;
  recipients: number;
  delivered: number;
  read: number;
  failed: number;
};

export type VotingDocumentsSummary = {
  items: VotingDocumentItem[];
};

export type VotingDocumentItem = {
  code: string;
  title: string;
  status: string;
  available: boolean;
  description: string;
};

export type VotingProcedureSummary = {
  status: string;
  checks: VotingProcedureCheck[];
};

export type VotingProcedureCheck = {
  code: string;
  title: string;
  status: "ok" | "warning" | "error" | string;
  comment: string;
};

export type VotingActionLogItem = {
  id: string;
  action: string;
  actor_name: string;
  actor_role: string;
  details: string;
  created_at?: string | null;
};
