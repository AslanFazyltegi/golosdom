export type VotingQuestion = {
  id: string;
  text: string;
  options?: string[] | null;
};

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
  end_at: string;
  send_notifications: boolean;
};

export type VotingStatus =
  | "draft"
  | "council_review"
  | "revision_required"
  | "pending_publish"
  | "published";
