import type { User } from "@/types/user";
import { LogoArea } from "./LogoArea";
import { UserAccountArea } from "./UserAccountArea";

export function CabinetHeader({
  accountOpen,
  activeRole,
  logout,
  onOpenModule,
  setAccountOpen,
  switchRole,
  user,
}: {
  accountOpen: boolean;
  activeRole: string;
  logout: () => void;
  onOpenModule: (code: string) => void;
  setAccountOpen: (value: boolean) => void;
  switchRole: (role: string) => void;
  user: User;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-20 items-center justify-between border-b bg-white px-8 shadow-sm">
      <LogoArea />
      <UserAccountArea
        accountOpen={accountOpen}
        activeRole={activeRole}
        logout={logout}
        onOpenModule={onOpenModule}
        setAccountOpen={setAccountOpen}
        switchRole={switchRole}
        user={user}
      />
    </header>
  );
}
