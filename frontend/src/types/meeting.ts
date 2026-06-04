export type Meeting = {
  id: string;
  building_id?: string | null;
  initiator_name: string;
  scheduled_at: string;
  location: string;
  agenda: string[];
  meeting_form: string;
  notification_id?: string | null;
  announcement_id?: string | null;
  status: string;
};
