import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  OwnerVotingAnswer,
  OwnerBatchVotingSubmission,
  OwnerVotingSubmission,
  Voting,
  VotingApprovalReview,
  VotingPublicationSchedulePayload,
  VotingResult,
  VotingSavePayload,
  StopVotingPayload,
} from "@/types/voting";

const API_BASE_URL = "http://localhost:8080";

export function fetchVotings(status?: string): Promise<Voting[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/api/v1/votings${query}`) as Promise<Voting[]>;
}

export function fetchVoting(id: string): Promise<Voting> {
  return apiFetch(`/api/v1/votings/${id}`) as Promise<Voting>;
}

export function fetchActiveVotings(): Promise<Voting[]> {
  return apiFetch("/api/v1/votings?status=active") as Promise<Voting[]>;
}

export function fetchCompletedVotings(): Promise<Voting[]> {
  return apiFetch("/api/v1/votings?status=completed") as Promise<Voting[]>;
}

export function fetchVotingDetails(id: string): Promise<Voting> {
  return fetchVoting(id);
}

export function submitOwnerVote(
  votingId: string,
  payload: OwnerVotingSubmission,
): Promise<{ message: string; answers: OwnerVotingAnswer[] }> {
  return apiFetch(`/api/v1/votings/${votingId}/vote`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ message: string; answers: OwnerVotingAnswer[] }>;
}

export function submitOwnerVoteBatch(
  payload: OwnerBatchVotingSubmission,
): Promise<{ message: string; answers: OwnerVotingAnswer[] }> {
  return apiFetch("/api/v1/votings/batch-vote", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ message: string; answers: OwnerVotingAnswer[] }>;
}

export function fetchMyVotingAnswers(votingId: string): Promise<OwnerVotingAnswer[]> {
  return apiFetch(`/api/v1/votings/${votingId}/my-vote`) as Promise<OwnerVotingAnswer[]>;
}

export function fetchVotingResults(votingId: string): Promise<VotingResult[]> {
  return apiFetch(`/api/v1/votings/${votingId}/results`) as Promise<VotingResult[]>;
}

export async function downloadVotingBlank(votingId: string): Promise<void> {
  const token = typeof window !== "undefined" ? getToken() : null;
  const response = await fetch(`${API_BASE_URL}/api/v1/votings/${votingId}/blank`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      throw new Error(data?.error || "Не удалось скачать бланк");
    }
    throw new Error("Не удалось скачать бланк");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = extractDownloadFilename(response) || `voting-${votingId}-blank.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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

export function stopVoting(id: string, payload: StopVotingPayload): Promise<Voting> {
  return apiFetch(`/api/v1/votings/${id}/stop`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<Voting>;
}

function extractDownloadFilename(response: Response) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || "";
}
