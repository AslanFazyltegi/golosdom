import { DashboardSummaryPage } from "@/modules/dashboard-summary";
import { InfoCenterPage } from "@/modules/info-center";
import { InfocenterNewsPage } from "@/modules/infocenter/news";
import {
  ActiveMeetingsPage,
  ApprovalMeetingsPage,
  CreateMeetingPage,
  MeetingsPage,
  PastMeetingsPage,
  RevisionMeetingsPage,
  UpcomingMeetingsPage,
} from "@/modules/meetings";
import { MyBuildingPage } from "@/modules/my-building";
import { NotificationsPage } from "@/modules/notifications";
import { ProfilePage } from "@/modules/profile";
import { SystemSettingsPage } from "@/modules/system-settings";
import { VotingConstructorPage } from "@/modules/voting-constructor";
import { PastVotingsPage, VotingsPage } from "@/modules/votings";
import type { CabinetModuleComponent } from "@/shared/types/cabinet";

export const moduleMap: Record<string, CabinetModuleComponent> = {
  dashboard: DashboardSummaryPage,
  dashboard_summary: DashboardSummaryPage,

  objects: MyBuildingPage,
  my_building: MyBuildingPage,
  my_properties: MyBuildingPage,

  meetings: MeetingsPage,
  meetings_create: CreateMeetingPage,
  meetings_active: ActiveMeetingsPage,
  meetings_upcoming: UpcomingMeetingsPage,
  meetings_past: PastMeetingsPage,
  meetings_approval: ApprovalMeetingsPage,
  meetings_revision: RevisionMeetingsPage,

  votings: VotingsPage,
  votings_active: VotingsPage,
  votings_past: PastVotingsPage,

  voting_constructor: VotingConstructorPage,
  voting_constructor_create: VotingConstructorPage,
  voting_constructor_approval: VotingConstructorPage,
  voting_constructor_revision: VotingConstructorPage,
  voting_constructor_pending_publication: VotingConstructorPage,
  voting_constructor_published: VotingConstructorPage,
  voting_constructor_draft: VotingConstructorPage,

  notifications: NotificationsPage,
  communication_news: InfocenterNewsPage,
  communication_announcements: InfoCenterPage,
  communication_notifications: InfoCenterPage,
  communication_deliveries: InfoCenterPage,

  profile: ProfilePage,
  role_switcher: ProfilePage,
  system_settings: SystemSettingsPage,
};
