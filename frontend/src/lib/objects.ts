import { apiFetch } from "@/lib/api";
import type {
  MyPropertiesResponse,
  PropertyCorrectionRequestsResponse,
  PropertyUpdateRequestPayload,
} from "@/types/objects";

export async function fetchObjects(role: string) {
  return apiFetch(`/api/v1/objects?role=${role}`);
}

export async function fetchMyProperties() {
  return apiFetch("/api/v1/my-properties") as Promise<MyPropertiesResponse>;
}

export async function createPropertyUpdateRequest(
  propertyId: string,
  payload: PropertyUpdateRequestPayload,
) {
  return apiFetch(`/api/v1/my-properties/${propertyId}/update-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchPropertyCorrectionRequests() {
  return apiFetch(
    "/api/v1/objects/update-requests",
  ) as Promise<PropertyCorrectionRequestsResponse>;
}

export async function markPropertyCorrectionRequestsRead() {
  return apiFetch("/api/v1/objects/update-requests", {
    method: "PATCH",
  });
}
