import { apiFetch } from "@/lib/api";
import type { UpdateProfilePayload, UserProfile } from "@/types/profile";

export async function fetchProfile(activeRole: string) {
  return apiFetch(
    `/api/v1/profile?active_role=${encodeURIComponent(activeRole)}`,
  ) as Promise<UserProfile>;
}

export async function updateProfile(
  activeRole: string,
  payload: UpdateProfilePayload,
) {
  return apiFetch(
    `/api/v1/profile?active_role=${encodeURIComponent(activeRole)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  ) as Promise<UserProfile>;
}
