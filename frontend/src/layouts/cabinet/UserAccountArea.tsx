import type { User } from "@/types/user";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import { AccountDropdown } from "./AccountDropdown";

export function UserAccountArea({
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
  const name = user.full_name?.trim() || user.email || "Пользователь";
  const initials = getInitials(name);

  return (
    <div className="relative">
      <button
        onClick={() => setAccountOpen(!accountOpen)}
        className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"
      >
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photo}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
            {initials}
          </div>
        )}

        <div className="min-w-40 text-right">
          <p className="max-w-56 truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-slate-500">{roleLabel(activeRole)}</p>
        </div>

        <span className="text-slate-500">⌄</span>
      </button>

      {accountOpen && (
        <AccountDropdown
          activeRole={activeRole}
          onOpenModule={onOpenModule}
          switchRole={switchRole}
          logout={logout}
          user={user}
        />
      )}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "👤";
}
