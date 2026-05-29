export type User = {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  phone?: string | null;
  phone_number?: string | null;
  photo?: string | null;
};
