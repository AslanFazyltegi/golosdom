export type NavigationItem = {
  id: string;
  code: string;

  title: string;
  icon: string;

  parent_id?: string | null;

  component?: string | null;

  sort_order?: number;

  is_active?: boolean;

  is_default?: boolean;

  children?: NavigationItem[];
};
