export type CommunicationTarget = {
  type: "all" | "role" | "property_type" | "user";
  value: string;
};

export type CommunicationChannel = {
  channel: "portal" | "whatsapp" | "telegram" | "sms";
  enabled: boolean;
};

export type CommunicationPost = {
  id: string;
  building_id: string;
  author_user_id: string;
  type: "news" | "announcement";
  title: string;
  body: string;
  image_url?: string | null;
  status: "draft" | "scheduled" | "published" | "hidden" | "deleted";
  importance: "normal" | "important" | "urgent";
  is_pinned: boolean;
  publish_at?: string | null;
  visible_from?: string | null;
  visible_until?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  read_at?: string | null;
  targets: CommunicationTarget[];
  channels: CommunicationChannel[];
};

export type CommunicationNotification = {
  id: string;
  building_id: string;
  author_user_id: string;
  title: string;
  body: string;
  status: "draft" | "sent" | "deleted";
  created_at: string;
  sent_at?: string | null;
  read_at?: string | null;
  targets: CommunicationTarget[];
  channels: CommunicationChannel[];
};

export type CommunicationDelivery = {
  id: string;
  entity_type: "post" | "notification";
  entity_id: string;
  entity_title: string;
  user_id: string;
  recipient: string;
  channel: "portal" | "whatsapp" | "telegram" | "sms";
  status:
    | "created"
    | "queued"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "channel_not_connected";
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunicationUnreadCounts = {
  news: number;
  announcement: number;
  notification: number;
};
