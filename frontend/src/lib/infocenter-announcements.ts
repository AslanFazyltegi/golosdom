import { apiFetch } from "@/lib/api";
import type {
  InfocenterAnnouncement,
  InfocenterAnnouncementPayload,
  InfocenterAnnouncementStatus,
} from "@/types/infocenter-announcement";

export async function fetchInfocenterAnnouncements(params: {
  status?: InfocenterAnnouncementStatus | "all";
  search?: string;
}) {
  const query = new URLSearchParams({ active_role: "CHAIRMAN" });
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return (await apiFetch(`/api/infocenter/announcements?${query.toString()}`)) as InfocenterAnnouncement[];
}

export async function createInfocenterAnnouncement(
  payload: InfocenterAnnouncementPayload,
  mode: "draft" | "publish" | "schedule" = "draft",
) {
  const query = new URLSearchParams({ active_role: "CHAIRMAN" });
  if (mode !== "draft") query.set("mode", mode);
  return apiFetch(`/api/infocenter/announcements?${query.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<InfocenterAnnouncement>;
}

export async function updateInfocenterAnnouncement(id: string, payload: InfocenterAnnouncementPayload) {
  return apiFetch(`/api/infocenter/announcements/${id}?active_role=CHAIRMAN`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<InfocenterAnnouncement>;
}

export async function runInfocenterAnnouncementAction(
  id: string,
  action:
    | "publish"
    | "schedule"
    | "cancel-schedule"
    | "hide"
    | "show"
    | "complete"
    | "delete"
    | "restore",
  payload: Record<string, unknown> = {},
) {
  return apiFetch(`/api/infocenter/announcements/${id}/${action}?active_role=CHAIRMAN`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<InfocenterAnnouncement>;
}

export async function permanentDeleteInfocenterAnnouncement(id: string) {
  return apiFetch(`/api/infocenter/announcements/${id}/permanent?active_role=CHAIRMAN`, {
    method: "DELETE",
  });
}
