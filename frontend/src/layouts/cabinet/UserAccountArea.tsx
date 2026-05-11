import type { User } from "@/types/user";
import { AccountDropdown } from "./AccountDropdown";

export function UserAccountArea({
  accountOpen,
  activeRole,
  logout,
  onOpenModule,
  roleOpen,
  setAccountOpen,
  setRoleOpen,
  switchRole,
  user,
}: {
  accountOpen: boolean;
  activeRole: string;
  logout: () => void;
  onOpenModule: (code: string) => void;
  roleOpen: boolean;
  setAccountOpen: (value: boolean) => void;
  setRoleOpen: (value: boolean) => void;
  switchRole: (role: string) => void;
  user: User;
}) {
  const phone = user.phone || user.phone_number || "Телефон не указан";

  return (
    <div className="relative">
      <button
        onClick={() => setAccountOpen(!accountOpen)}
        className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
          👤
        </div>

        <div className="min-w-40 text-right">
          <p className="text-sm font-medium">{phone}</p>
          <p className="text-xs text-slate-500">{activeRole}</p>
        </div>

        <span className="text-slate-500">⌄</span>
      </button>

      {accountOpen && (
        <AccountDropdown
          activeRole={activeRole}
          roleOpen={roleOpen}
          setRoleOpen={setRoleOpen}
          onOpenModule={onOpenModule}
          switchRole={switchRole}
          logout={logout}
          user={user}
        />
      )}
    </div>
  );
}
