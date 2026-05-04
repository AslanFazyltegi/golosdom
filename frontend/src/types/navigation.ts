export type NavigationItem = {
  code: string;
  title: string;
  icon: string;
  component: string;

  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;

  is_default: boolean;

  children: NavigationItem[];
};