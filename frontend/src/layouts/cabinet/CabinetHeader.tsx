import type { User } from "@/types/user";
import { UserAccountArea } from "./UserAccountArea";

export function CabinetHeader({
  accountOpen,
  activeRole,
  activeModuleTitle,
  buildingTitle,
  logout,
  onOpenHelp,
  onOpenImportantEvents,
  onToggleDesktopSidebar,
  onToggleMobileSidebar,
  onOpenModule,
  sidebarCollapsed,
  setAccountOpen,
  switchRole,
  user,
}: {
  accountOpen: boolean;
  activeRole: string;
  activeModuleTitle: string;
  buildingTitle: string;
  logout: () => void;
  onOpenHelp: () => void;
  onOpenImportantEvents: () => void;
  onToggleDesktopSidebar: () => void;
  onToggleMobileSidebar: () => void;
  onOpenModule: (code: string) => void;
  sidebarCollapsed: boolean;
  setAccountOpen: (value: boolean) => void;
  switchRole: (role: string) => void | Promise<void>;
  user: User;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--gd-border)] bg-[var(--gd-header)] px-4 shadow-sm backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-lg font-bold text-[var(--gd-text)] lg:hidden"
          aria-label="Открыть меню"
        >
          ☰
        </button>
        <button
          type="button"
          onClick={onToggleDesktopSidebar}
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-lg font-bold text-[var(--gd-text)] transition hover:bg-[var(--gd-primary-faint)] hover:text-[var(--gd-primary)] lg:flex"
          aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {sidebarCollapsed ? "›" : "‹"}
        </button>
        <div className="min-w-0">
          <p className="hidden truncate text-xs font-bold uppercase text-[var(--gd-muted)] sm:block">
            {buildingTitle}
          </p>
          <h1 className="truncate text-base font-bold leading-tight text-[var(--gd-text-strong)] sm:text-lg">
            {activeModuleTitle}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenImportantEvents}
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-sm font-black text-[var(--gd-muted-strong)] transition hover:bg-[var(--gd-primary-faint)] hover:text-[var(--gd-primary)] sm:flex"
          aria-label="Важные события"
        >
          !
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-sm font-black text-[var(--gd-muted-strong)] transition hover:bg-[var(--gd-primary-faint)] hover:text-[var(--gd-primary)] sm:flex"
          aria-label="Помощь"
        >
          ?
        </button>
          <UserAccountArea
            key={activeRole}
            accountOpen={accountOpen}
            activeRole={activeRole}
            logout={logout}
            onOpenModule={onOpenModule}
            setAccountOpen={setAccountOpen}
            switchRole={switchRole}
            user={user}
          />
      </div>
    </header>
  );
}
