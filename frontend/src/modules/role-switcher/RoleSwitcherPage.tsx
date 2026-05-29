import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { ProfilePage } from "@/modules/profile";

export function RoleSwitcherPage(props: CabinetModuleProps) {
  return <ProfilePage {...props} />;
}
