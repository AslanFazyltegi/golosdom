import type { User } from "@/types/user";
import { AccountMenuItem } from "./AccountMenuItem";

export function AccountDropdown({
  activeRole,
  roleOpen,
  setRoleOpen,
  onOpenModule,
  switchRole,
  logout,
  user,
}: {
  activeRole: string;
  roleOpen: boolean;
  setRoleOpen: (value: boolean) => void;
  onOpenModule: (code: string) => void;
  switchRole: (role: string) => void;
  logout: () => void;
  user: User;
}) {
  return (
    <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border bg-white p-2 shadow-lg">
      <AccountMenuItem
        onClick={() => {
          onOpenModule("role_switcher");
          setRoleOpen(!roleOpen);
        }}
        trailing={<span className="text-sm text-slate-500">{activeRole}</span>}
      >
        Роль
      </AccountMenuItem>

      {roleOpen && (
        <div className="mb-2 rounded-xl bg-slate-50 p-2">
          {user.roles.map((role) => (
            <button
              key={role}
              onClick={() => switchRole(role)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                activeRole === role ? "bg-blue-600 text-white" : "hover:bg-white"
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      )}

      <AccountMenuItem onClick={() => onOpenModule("profile")}>
        Профиль
      </AccountMenuItem>

      <AccountMenuItem onClick={() => onOpenModule("system_settings")}>
        Настройки системы
      </AccountMenuItem>

      <div className="my-2 border-t" />

      <AccountMenuItem danger onClick={logout}>
        Выход
      </AccountMenuItem>
    </div>
  );
}
