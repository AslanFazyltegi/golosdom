import type { NavigationItem } from "@/types/navigation";
import { ChildMenuItem } from "./ChildMenuItem";
import { ParentMenuItem } from "./ParentMenuItem";

export function CabinetSidebar({
  activeComponent,
  collapsed,
  expandedMenuCodes,
  mobileOpen,
  menu,
  onCloseMobile,
  onOpenItem,
}: {
  activeComponent: string;
  collapsed: boolean;
  expandedMenuCodes: string[];
  mobileOpen: boolean;
  menu: NavigationItem[];
  onCloseMobile: () => void;
  onOpenItem: (item: NavigationItem) => void;
}) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          aria-label="Закрыть меню"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`fixed left-0 top-20 z-40 h-[calc(100vh-80px)] overflow-hidden border-r border-[var(--gd-border)] bg-[var(--gd-sidebar)] shadow-lg transition-all duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-24" : "w-80 lg:w-72"}`}
      >
        <div className="flex h-full flex-col p-4">
          <div
            className={`mb-4 rounded-2xl border border-[var(--gd-border)] bg-[var(--gd-sidebar-accent)] p-4 ${
              collapsed ? "hidden lg:block" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--gd-primary)] font-black text-white">
                G
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--gd-text-strong)]">
                    Golosdom
                  </p>
                  <p className="truncate text-xs font-semibold text-[var(--gd-muted)]">
                    единый кабинет дома
                  </p>
                </div>
              )}
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {menu.map((item) => {
              const isExpanded = expandedMenuCodes.includes(item.code);
              const hasChildren = Boolean(item.children && item.children.length > 0);
              const childActive = Boolean(
                item.children?.some(
                  (child) => (child.component || child.code) === activeComponent,
                ),
              );

              return (
                <div key={item.code}>
                  <ParentMenuItem
                    icon={item.icon}
                    text={item.title}
                    active={activeComponent === item.component || childActive}
                    collapsed={collapsed}
                    hasChildren={hasChildren}
                    expanded={isExpanded}
                    unreadCount={item.unread_count}
                    onClick={() => onOpenItem(item)}
                  />

                  {hasChildren && !collapsed && (
                    <div
                      className={`ml-5 overflow-hidden border-l border-[var(--gd-border)] pl-3 transition-[max-height,opacity,transform,margin] duration-200 ease-out ${
                        isExpanded
                          ? "mt-1 max-h-[640px] translate-y-0 opacity-100"
                          : "mt-0 max-h-0 -translate-y-1 opacity-0"
                      }`}
                    >
                      <div className="space-y-1 py-1">
                        {item.children?.map((child) => (
                          <ChildMenuItem
                            key={child.code}
                            icon={child.icon}
                            text={child.title}
                            active={(child.component || child.code) === activeComponent}
                            unreadCount={child.unread_count}
                            onClick={() => onOpenItem(child)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {!collapsed && (
            <div className="mt-4 rounded-2xl border border-[var(--gd-border)] bg-[var(--gd-surface-muted)] p-4 text-sm">
              <p className="font-bold text-[var(--gd-text-strong)]">Поддержка</p>
              <p className="mt-1 text-xs leading-5 text-[var(--gd-muted)]">
                Вопросы по кабинетам, голосованиям и профилю.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
