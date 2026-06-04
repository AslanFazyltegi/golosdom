export type InfocenterAnnouncementStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "hidden"
  | "completed"
  | "deleted";

export type InfocenterAnnouncementAction = {
  id: string;
  announcement_id: string;
  action: string;
  reason?: string | null;
  actor_id: string;
  created_at: string;
};

export type InfocenterAnnouncement = {
  id: string;
  title: string;
  body_json: Record<string, unknown>;
  body_html: string;
  category: string;
  audience_type: string;
  audience_filter?: Record<string, unknown> | null;
  status: InfocenterAnnouncementStatus;
  is_visible: boolean;
  is_pinned: boolean;
  is_important: boolean;
  notify_enabled: boolean;
  published_at?: string | null;
  scheduled_at?: string | null;
  actual_until?: string | null;
  pinned_until?: string | null;
  hidden_at?: string | null;
  completed_at?: string | null;
  deleted_at?: string | null;
  created_by: string;
  updated_by?: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
  views_count: number;
  reads_count: number;
  read_at?: string | null;
  history: InfocenterAnnouncementAction[];
};

export type InfocenterAnnouncementPayload = {
  title: string;
  body_json: Record<string, unknown>;
  body_html: string;
  category: string;
  audience_type: string;
  audience_filter: Record<string, unknown> | null;
  is_pinned: boolean;
  is_important: boolean;
  notify_enabled: boolean;
  actual_until?: string | null;
  scheduled_at?: string | null;
};
