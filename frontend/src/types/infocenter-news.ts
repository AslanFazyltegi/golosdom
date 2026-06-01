export type InfocenterNewsStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "hidden"
  | "unpublished"
  | "deleted";

export type InfocenterNewsImage = {
  id: string;
  news_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  created_at: string;
};

export type InfocenterNewsAction = {
  id: string;
  news_id: string;
  action: string;
  reason?: string | null;
  actor_id: string;
  created_at: string;
};

export type InfocenterNews = {
  id: string;
  title: string;
  summary: string;
  body_json: Record<string, unknown>;
  body_html: string;
  category: string;
  audience_type: string;
  audience_filter?: Record<string, unknown> | null;
  status: InfocenterNewsStatus;
  is_visible: boolean;
  is_pinned: boolean;
  is_important: boolean;
  notify_enabled: boolean;
  cover_image_id?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
  hidden_at?: string | null;
  unpublished_at?: string | null;
  deleted_at?: string | null;
  created_by: string;
  updated_by?: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
  views_count: number;
  reads_count: number;
  images: InfocenterNewsImage[];
  history: InfocenterNewsAction[];
};

export type InfocenterNewsPayload = {
  title: string;
  summary: string;
  body_json: Record<string, unknown>;
  body_html: string;
  category: string;
  audience_type: string;
  audience_filter: Record<string, unknown> | null;
  is_pinned: boolean;
  is_important: boolean;
  notify_enabled: boolean;
  scheduled_at?: string | null;
};
