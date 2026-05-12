import { apiFetch } from "@/lib/api";

export async function fetchMeetings(status?: string) {
  const query = status ? `?status=${status}` : "";
  return apiFetch(`/api/v1/meetings${query}`);
}

export async function createMeeting(payload: {
  initiator_name: string;
  scheduled_at: string;
  location: string;
  agenda: string[];
  meeting_form?: string;
  status?: string;
}) {
  return apiFetch("/api/v1/meetings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}