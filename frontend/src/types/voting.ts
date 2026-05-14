export type VotingQuestion = {
  id: string;
  text: string;
  options: string[];
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
  version: number;
  review_deadline?: string | null;
  meeting?: VotingMeeting | null;
  questions: VotingQuestion[];
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
  version: number;
  status: "in_progress" | "approved" | "revision_required" | "no_majority";
  deadline: string;
  approve_count: number;
  revision_count: number;
  total_council_members: number;
  pending_council_members: number;
  no_majority_reason?: string;
  votes: VotingApprovalVote[];
};

export type VotingDraftPayload = {
  title: string;
  description: string;
  meeting_id?: string | null;
  questions: VotingQuestion[];
};

export type VotingStatus =
  | "draft"
  | "council_review"
  | "revision_required"
  | "pending_publish"
  | "published";
