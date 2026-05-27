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
