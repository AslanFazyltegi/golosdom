import { apiFetch } from "@/lib/api";

export type MeetingOwner = {
  id: string;
  full_name: string;
  property_number: string;
};

export async function fetchOwners() {
  return apiFetch("/api/v1/owners");
}