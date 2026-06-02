import { apiFetch } from "@/lib/api";
import type {
  CommunicationDelivery,
  CommunicationNotification,
  CommunicationPost,
  CommunicationUnreadCounts,
} from "@/types/communications";

export async function fetchCommunicationPosts(
  type: "news" | "announcement",
  status = "all",
  activeRole?: string,
): Promise<CommunicationPost[]> {
  const roleQuery = activeRole ? `&active_role=${activeRole}` : "";
  return apiFetch(
    `/api/v1/communications/posts?type=${type}&status=${status}${roleQuery}`,
  ) as Promise<CommunicationPost[]>;
}

export async function saveCommunicationPost(
  payload: Partial<CommunicationPost>,
  id?: string,
): Promise<CommunicationPost> {
  const path = id
    ? `/api/v1/communications/posts/${id}`
    : "/api/v1/communications/posts";
  return apiFetch(path, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  }) as Promise<CommunicationPost>;
}

export async function deleteCommunicationPost(id: string) {
  return apiFetch(`/api/v1/communications/posts/${id}`, { method: "DELETE" });
}

export async function markCommunicationPostRead(id: string) {
  return apiFetch(`/api/v1/communications/posts/${id}/read`, {
    method: "POST",
  });
}

export async function fetchCommunicationNotifications(): Promise<
  CommunicationNotification[]
> {
  return apiFetch("/api/v1/communications/notifications") as Promise<
    CommunicationNotification[]
  >;
}

export async function fetchCommunicationNotificationsForRole(
  activeRole?: string,
  params: Record<string, string> = {},
): Promise<CommunicationNotification[]> {
  const query = new URLSearchParams();
  if (activeRole) query.set("active_role", activeRole);
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== "all") query.set(key, value);
  });
  return apiFetch(`/api/v1/communications/notifications?${query.toString()}`) as Promise<
    CommunicationNotification[]
  >;
}

export async function sendCommunicationNotification(
  payload: Partial<CommunicationNotification>,
  mode = "send",
): Promise<CommunicationNotification> {
  return apiFetch(`/api/v1/communications/notifications?mode=${mode}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<CommunicationNotification>;
}

export async function updateCommunicationNotification(
  id: string,
  payload: Partial<CommunicationNotification>,
  mode = "",
): Promise<CommunicationNotification> {
  const suffix = mode ? `?mode=${mode}` : "";
  return apiFetch(`/api/v1/communications/notifications/${id}${suffix}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<CommunicationNotification>;
}

export async function runCommunicationNotificationAction(
  id: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<CommunicationNotification> {
  return apiFetch(`/api/v1/communications/notifications/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<CommunicationNotification>;
}

export async function permanentDeleteCommunicationNotification(id: string) {
  return apiFetch(`/api/v1/communications/notifications/${id}/permanent`, {
    method: "DELETE",
  });
}

export async function fetchCommunicationNotificationReport(
  id: string,
): Promise<CommunicationDelivery[]> {
  return apiFetch(`/api/v1/communications/notifications/${id}/report`) as Promise<
    CommunicationDelivery[]
  >;
}

export async function markCommunicationNotificationRead(id: string) {
  return apiFetch(`/api/v1/communications/notifications/${id}/read`, {
    method: "POST",
  });
}

export async function fetchCommunicationDeliveries(): Promise<
  CommunicationDelivery[]
> {
  return apiFetch(
    "/api/v1/communications/deliveries",
  ) as Promise<CommunicationDelivery[]>;
}

export async function fetchCommunicationUnreadCounts(): Promise<CommunicationUnreadCounts> {
  return apiFetch(
    "/api/v1/communications/unread-counts",
  ) as Promise<CommunicationUnreadCounts>;
}
