export type ProfileUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  photo: string | null;
};

export type ProfileChairman = {
  id: string | null;
  full_name: string | null;
  phone: string | null;
};

export type ProfileBuilding = {
  id: string;
  building_name: string | null;
  city: string;
  district: string | null;
  street: string;
  house_number: string;
  house_fraction: string | null;
};

export type ProfileOsi = {
  id: string;
  name: string;
  bin: string | null;
  address: string | null;
  chairman: ProfileChairman | null;
  buildings: ProfileBuilding[];
};

export type UserProfile = {
  user: ProfileUser;
  active_role: string;
  roles: string[];
  osi: ProfileOsi[];
};

export type UpdateProfilePayload = {
  full_name: string;
  phone: string;
  photo: string;
};
