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
  VotingSummaryDetail,
  VotingSummaryResponse,
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

export type VotingSummaryFilters = {
  search?: string;
  meetingDateFrom?: string;
  meetingDateTo?: string;
  publicationDateFrom?: string;
  publicationDateTo?: string;
  completionDateFrom?: string;
  completionDateTo?: string;
  status?: string;
  category?: string;
  quorum?: string;
  risk?: string;
};

export function fetchVotingSummary(
  filters: VotingSummaryFilters = {},
): Promise<VotingSummaryResponse> {
  return apiFetch(`/api/v1/votings/summary${buildVotingSummaryQuery(filters)}`) as Promise<VotingSummaryResponse>;
}

export function fetchVotingSummaryDetail(votingId: string): Promise<VotingSummaryDetail> {
  return apiFetch(`/api/v1/votings/summary/${votingId}`) as Promise<VotingSummaryDetail>;
}

export function sendVotingSummaryReminders(
  votingId: string,
  userIds: string[] = [],
): Promise<{ sent: number }> {
  return apiFetch(`/api/v1/votings/summary/${votingId}/reminders`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  }) as Promise<{ sent: number }>;
}

export function downloadVotingSummaryCSV(filters: VotingSummaryFilters = {}) {
  return downloadFromApi(`/api/v1/votings/summary/export.csv${buildVotingSummaryQuery(filters)}`, "voting-summary.csv");
}

export function downloadVotingSummaryDetailCSV(votingId: string) {
  return downloadFromApi(`/api/v1/votings/summary/${votingId}/export.csv`, `voting-${votingId}-summary.csv`);
}

export async function openVotingSummaryReport(votingId: string) {
  const html = await fetchTextFromApi(`/api/v1/votings/summary/${votingId}/report`);
  openPrintWindow(html, false);
}

export async function printVotingSummaryOwnerSheet(votingId: string, ownerId: string) {
  const html = await fetchTextFromApi(`/api/v1/votings/summary/${votingId}/owners/${ownerId}/print`);
  openPrintWindow(html, true);
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

function buildVotingSummaryQuery(filters: VotingSummaryFilters) {
  const params = new URLSearchParams();
  appendParam(params, "search", filters.search);
  appendParam(params, "meeting_date_from", filters.meetingDateFrom);
  appendParam(params, "meeting_date_to", filters.meetingDateTo);
  appendParam(params, "publication_date_from", filters.publicationDateFrom);
  appendParam(params, "publication_date_to", filters.publicationDateTo);
  appendParam(params, "completion_date_from", filters.completionDateFrom);
  appendParam(params, "completion_date_to", filters.completionDateTo);
  appendParam(params, "status", filters.status);
  appendParam(params, "category", filters.category);
  appendParam(params, "quorum", filters.quorum);
  appendParam(params, "risk", filters.risk);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function appendParam(params: URLSearchParams, key: string, value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "all") return;
  params.set(key, normalized);
}

async function downloadFromApi(path: string, fallbackFilename: string) {
  const token = typeof window !== "undefined" ? getToken() : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(await responseError(response, "Не удалось скачать файл"));
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = extractDownloadFilename(response) || fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function fetchTextFromApi(path: string) {
  const token = typeof window !== "undefined" ? getToken() : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(await responseError(response, "Не удалось открыть документ"));
  }

  return response.text();
}

async function responseError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return data?.error || fallback;
  }
  return fallback;
}

function openPrintWindow(html: string, printImmediately: boolean) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Не удалось открыть окно печати");
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  if (printImmediately) {
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}
