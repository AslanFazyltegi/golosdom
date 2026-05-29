export type BuildingObject = {
  type: "building";
  city: string;
  district: string | null;
  building_name: string | null;
  street: string;
  house_number: string;
  house_fraction: string | null;
  floors_count: number | null;
  entrances_count: number | null;
  apartments_count: number | null;
  commercial_units_count: number | null;
  storerooms_count: number | null;
  parking_spaces_count: number | null;
};

export type PropertyObject = {
  type: "property";
  property_type: string;
  number: string;
  area: number;
  status: string;
};

export type MyPropertiesResponse = {
  summary: MyPropertiesSummary;
  properties: MyProperty[];
};

export type MyPropertiesSummary = {
  totalObjects: number;
  activeObjects: number;
  ercAccounts: number;
  activeVotings: number;
};

export type MyProperty = {
  id: string;
  type: string;
  typeLabel: string;
  number: string;
  title: string;
  status: string;
  statusLabel: string;
  area: number | null;
  floor: number | null;
  entrance: number | null;
  share: number | null;
  ercAccount: string | null;
  payerName: string | null;
  payerStatus: string;
  payerStatusLabel: string;
  payerUpdatedAt: string | null;
  imageUrl: string | null;
  building: {
    id: string;
    name: string;
    city: string;
    district: string | null;
    street: string;
    houseNumber: string;
    houseFraction: string | null;
    fullAddress: string;
  };
  votingParticipation: {
    general: boolean;
    apartmentCommercial: boolean;
    storageParking: boolean;
  };
};

export type PropertyUpdateRequestPayload = {
  requestType: string;
  newValue: string;
  comment: string;
};
