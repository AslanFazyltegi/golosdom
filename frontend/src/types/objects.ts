export type BuildingObject = {
  type: "building";
  city: string;
  district: string;
  street: string;
  house_number: string;
  floors_count: number;
  entrances_count: number;
  apartments_count: number;
  commercial_units_count: number;
  storerooms_count: number;
  parking_spaces_count: number;
};

export type PropertyObject = {
  type: "property";
  property_type: string;
  number: string;
  area: number;
  status: string;
};