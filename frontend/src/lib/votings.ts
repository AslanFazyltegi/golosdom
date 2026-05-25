import { apiFetch } from "@/lib/api";
import type {
  Voting,
  VotingApprovalReview,
  VotingPublicationSchedulePayload,
  VotingSavePayload,
} from "@/types/voting";

export function fetchVotings(status?: string): Promise<Voting[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/api/v1/votings${query}`) as Promise<Voting[]>;
}

export function fetchVoting(id: string): Promise<Voting> {
  return apiFetch(`/api/v1/votings/${id}`) as Promise<Voting>;
}

export function createVotingDraft(payload: VotingSavePayload): Promise<Voting> {
  return apiFetch("/api/v1/votings/draft", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<Voting>;
}

export function updateVotingDraft(
  id: string,
  payload: VotingSavePayload,
): Promise<Voting> {
  return apiFetch(`/api/v1/votings/${id}/draft`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<Voting>;
}

export function submitVotingToCouncil(id: string) {
  return apiFetch(`/api/v1/votings/${id}/submit-to-council`, {
    method: "POST",
  }) as Promise<{ voting: Voting; warning?: string }>;
}

export function resubmitVotingToCouncil(id: string) {
  return apiFetch(`/api/v1/votings/${id}/resubmit-to-council`, {
    method: "POST",
  }) as Promise<{ voting: Voting; warning?: string }>;
}

export function deleteVoting(id: string) {
  return apiFetch(`/api/v1/votings/${id}`, {
    method: "DELETE",
  });
}

export function fetchVotingApproval(id: string): Promise<VotingApprovalReview> {
  return apiFetch(`/api/v1/votings/${id}/approval`) as Promise<VotingApprovalReview>;
}

export function submitApprovalVote(
  id: string,
  payload: { decision: "approve" | "revision"; reason?: string; comment?: string },
): Promise<VotingApprovalReview> {
  return apiFetch(`/api/v1/votings/${id}/approval/vote`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<VotingApprovalReview>;
}

export function scheduleVotingPublication(
  id: string,
  payload: VotingPublicationSchedulePayload,
): Promise<Voting> {
  return apiFetch(`/api/v1/votings/${id}/schedule-publication`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<Voting>;
}

export function stopVoting(id: string): Promise<Voting> {
  return apiFetch(`/api/v1/votings/${id}/stop`, {
    method: "POST",
  }) as Promise<Voting>;
}
