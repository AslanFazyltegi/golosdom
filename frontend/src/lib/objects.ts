import { apiFetch } from "@/lib/api";

export async function fetchObjects(role: string) {
  return apiFetch(`/api/v1/objects?role=${role}`);
}