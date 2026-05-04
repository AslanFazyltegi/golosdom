import { apiFetch } from "@/lib/api";
import type { NavigationItem } from "@/types/navigation";

export async function fetchNavigation(
  role: string
): Promise<NavigationItem[]> {
  return apiFetch(
    `/api/v1/navigation/menu?role=${role}`
  );
}