import { apiFetch } from "@/lib/api";

export type MeetingOwner = {
  id: string;
  full_name: string;
  property_number: string;
  email?: string;
  phone?: string;
};

export type OwnerSearchResult = {
  user_id: string;
  label: string;
  name: string;
  email: string;
  phone: string;
  properties: string[];
};

export async function fetchOwners() {
  return apiFetch("/api/v1/owners");
}

export async function searchOwners(query: string): Promise<OwnerSearchResult[]> {
  return apiFetch(`/api/v1/owners/search?q=${encodeURIComponent(query)}`) as Promise<OwnerSearchResult[]>;
}
