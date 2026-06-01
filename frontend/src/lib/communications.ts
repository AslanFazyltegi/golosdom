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
): Promise<CommunicationNotification[]> {
  const roleQuery = activeRole ? `?active_role=${activeRole}` : "";
  return apiFetch(`/api/v1/communications/notifications${roleQuery}`) as Promise<
    CommunicationNotification[]
  >;
}

export async function sendCommunicationNotification(
  payload: Partial<CommunicationNotification>,
): Promise<CommunicationNotification> {
  return apiFetch("/api/v1/communications/notifications", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<CommunicationNotification>;
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
