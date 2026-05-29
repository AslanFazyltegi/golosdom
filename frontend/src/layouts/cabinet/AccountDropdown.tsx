import type { User } from "@/types/user";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import { AccountMenuItem } from "./AccountMenuItem";

export function AccountDropdown({
  activeRole,
  onOpenModule,
  switchRole,
  logout,
  user,
}: {
  activeRole: string;
  onOpenModule: (code: string) => void;
  switchRole: (role: string) => void;
  logout: () => void;
  user: User;
}) {
  const fullName = user.full_name?.trim() || "Не указано";
  const phone = user.phone || user.phone_number || "Телефон не указан";
  const initials = getInitials(fullName);

  return (
    <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border bg-white p-2 shadow-lg">
      <div className="flex gap-3 px-4 pb-3 pt-2">
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photo}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
            {initials}
          </div>
        )}
        <div>
          <p className="font-semibold leading-snug text-slate-900">
            {fullName}
          </p>
          <p className="mt-1 text-sm text-slate-500">{phone}</p>
        <p className="mt-3 text-sm text-slate-600">
          Активная роль:{" "}
          <span className="font-medium text-slate-900">
            {roleLabel(activeRole)}
          </span>
        </p>
        </div>
      </div>

      <div className="mb-2 rounded-xl bg-slate-50 p-2">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Сменить роль
        </p>
        {user.roles.map((role) => {
          const isActive = activeRole === role;

          return (
            <button
              key={role}
              onClick={() => {
                if (!isActive) switchRole(role);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                isActive
                  ? "bg-blue-600 font-medium text-white"
                  : "text-slate-700 hover:bg-white"
              }`}
            >
              <span className="w-4 text-center">{isActive ? "✓" : ""}</span>
              <span>{roleLabel(role)}</span>
            </button>
          );
        })}
      </div>

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

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "👤";
}
