import { getToken } from "./auth";

export const API_BASE_URL = "http://localhost:8080";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? getToken() : null;

  const headers = new Headers(options.headers || {});
  const hasFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!hasFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data?.error
        ? data.error
        : typeof data === "string" && data.trim()
          ? data.trim()
          : "Request failed";
    throw new Error(message);
  }

  return data;
}

export function apiAssetUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  if (!path.startsWith("/")) return path;

  return `${API_BASE_URL}${path}`;
}
