import { apiFetch } from "@/lib/api";

export async function fetchMeetings(period?: string) {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";

  return apiFetch(`/api/v1/meetings${query}`);
}

export async function createMeeting(payload: {
  initiator_name: string;
  scheduled_at: string;
  location: string;
  agenda: string[];
  building_id: string;
  deduplication_key?: string;
  meeting_form?: string;
  notification_html: string;
  status?: string;
}) {
  return apiFetch("/api/v1/meetings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
