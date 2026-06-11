import type { User } from "@/types/user";
import { LogoArea } from "./LogoArea";
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
  switchRole: (role: string) => void;
  user: User;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-20 items-center justify-between border-b border-[var(--gd-border)] bg-[var(--gd-header)] px-4 shadow-sm backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-lg font-bold text-[var(--gd-text)] lg:hidden"
          aria-label="Открыть меню"
        >
          ☰
        </button>
        <button
          type="button"
          onClick={onToggleDesktopSidebar}
          className="hidden h-11 w-11 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-lg font-bold text-[var(--gd-text)] transition hover:bg-[var(--gd-surface-muted)] lg:flex"
          aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {sidebarCollapsed ? "›" : "‹"}
        </button>
        <LogoArea />
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-xs font-bold uppercase text-[var(--gd-muted)]">
            {buildingTitle}
          </p>
          <h1 className="truncate text-lg font-extrabold leading-tight text-[var(--gd-text-strong)] lg:text-xl">
            {activeModuleTitle}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenImportantEvents}
          className="hidden h-11 w-11 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-sm font-black text-[var(--gd-muted-strong)] transition hover:bg-[var(--gd-surface-muted)] sm:flex"
          aria-label="Важные события"
        >
          !
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          className="hidden h-11 w-11 items-center justify-center rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] text-sm font-black text-[var(--gd-muted-strong)] transition hover:bg-[var(--gd-surface-muted)] sm:flex"
          aria-label="Помощь"
        >
          ?
        </button>
        <UserAccountArea
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
