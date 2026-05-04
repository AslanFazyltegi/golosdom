import type { User } from "@/types/user";

type ViewMode = "dashboard" | "profile" | "settings";

type Props = {
  user: User;
  activeRole: string;
  accountOpen: boolean;
  roleOpen: boolean;
  setAccountOpen: (value: boolean) => void;
  setRoleOpen: (value: boolean) => void;
  setView: (value: ViewMode) => void;
  switchRole: (role: string) => void;
  logout: () => void;
};

export function DashboardHeader({
  user,
  activeRole,
  accountOpen,
  roleOpen,
  setAccountOpen,
  setRoleOpen,
  setView,
  switchRole,
  logout,
}: Props) {
  const phone = user.phone || user.phone_number || "Телефон не указан";

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-20 items-center justify-between border-b bg-white px-8 shadow-sm">
      <div className="flex h-12 w-48 items-center justify-center rounded-xl border bg-white text-slate-500">
        Лого
      </div>

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
          <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border bg-white p-2 shadow-lg">
            <button
              onClick={() => setRoleOpen(!roleOpen)}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left hover:bg-slate-50"
            >
              <span>Роль</span>
              <span className="text-sm text-slate-500">{activeRole}</span>
            </button>

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

            <button
              onClick={() => {
                setView("profile");
                setAccountOpen(false);
              }}
              className="block w-full rounded-xl px-4 py-3 text-left hover:bg-slate-50"
            >
              Профиль
            </button>

            <button
              onClick={() => {
                setView("settings");
                setAccountOpen(false);
              }}
              className="block w-full rounded-xl px-4 py-3 text-left hover:bg-slate-50"
            >
              Настройки системы
            </button>

            <div className="my-2 border-t" />

            <button
              onClick={logout}
              className="block w-full rounded-xl px-4 py-3 text-left text-red-600 hover:bg-red-50"
            >
              Выход
            </button>
          </div>
        )}
      </div>
    </header>
  );
}