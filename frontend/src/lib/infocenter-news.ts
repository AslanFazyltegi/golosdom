import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  InfocenterNews,
  InfocenterNewsPayload,
  InfocenterNewsStatus,
} from "@/types/infocenter-news";

const API_BASE_URL = "http://localhost:8080";

export async function fetchInfocenterNews(params: {
  status?: InfocenterNewsStatus | "all";
  search?: string;
}) {
  const query = new URLSearchParams({ active_role: "CHAIRMAN" });
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  try {
    return (await apiFetch(`/api/infocenter/news?${query.toString()}`)) as InfocenterNews[];
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message !== "Request failed"
        ? err.message
        : "Не удалось загрузить новости. Проверьте подключение к серверу.",
    );
  }
}

export async function fetchMyInfocenterNews() {
  return (await apiFetch("/api/infocenter/news/my")) as InfocenterNews[];
}

export async function markInfocenterNewsRead(id: string) {
  return apiFetch(`/api/infocenter/news/${id}/read`, {
    method: "POST",
  });
}

export async function createInfocenterNews(
  payload: InfocenterNewsPayload,
  mode: "draft" | "publish" | "schedule" = "draft",
) {
  const query = new URLSearchParams({ active_role: "CHAIRMAN" });
  if (mode !== "draft") query.set("mode", mode);
  return apiFetch(`/api/infocenter/news?${query.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<InfocenterNews>;
}

export async function updateInfocenterNews(
  id: string,
  payload: InfocenterNewsPayload,
) {
  return apiFetch(`/api/infocenter/news/${id}?active_role=CHAIRMAN`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Promise<InfocenterNews>;
}

export async function runInfocenterNewsAction(
  id: string,
  action:
    | "publish"
    | "schedule"
    | "cancel-schedule"
    | "hide"
    | "show"
    | "unpublish"
    | "delete"
    | "restore",
  payload: Record<string, unknown> = {},
) {
  return apiFetch(
    `/api/infocenter/news/${id}/${action}?active_role=CHAIRMAN`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  ) as Promise<InfocenterNews>;
}

export async function permanentDeleteInfocenterNews(id: string) {
  return apiFetch(`/api/infocenter/news/${id}/permanent?active_role=CHAIRMAN`, {
    method: "DELETE",
  });
}

export async function uploadInfocenterNewsImage(id: string, file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `${API_BASE_URL}/api/infocenter/news/${id}/images?active_role=CHAIRMAN`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Не удалось загрузить изображение");
  }
  return data as InfocenterNews;
}

export async function deleteInfocenterNewsImage(id: string, imageId: string) {
  return apiFetch(
    `/api/infocenter/news/${id}/images/${imageId}?active_role=CHAIRMAN`,
    { method: "DELETE" },
  ) as Promise<InfocenterNews>;
}

export async function setInfocenterNewsCover(id: string, imageId: string) {
  return apiFetch(
    `/api/infocenter/news/${id}/cover/${imageId}?active_role=CHAIRMAN`,
    { method: "POST" },
  ) as Promise<InfocenterNews>;
}

export function infocenterNewsMediaUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}
