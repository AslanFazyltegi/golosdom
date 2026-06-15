import type { NavigationItem } from "@/types/navigation";
import { BizdinLogo } from "@/shared/ui/brand";
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
        className={`fixed left-0 top-16 z-40 h-[calc(100vh-64px)] overflow-hidden border-r border-[var(--gd-border)] bg-[var(--gd-sidebar)] shadow-lg transition-all duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          collapsed
            ? "w-[min(18rem,calc(100vw-2rem))] lg:w-[var(--gd-sidebar-collapsed-width)]"
            : "w-[min(18rem,calc(100vw-2rem))] lg:w-[var(--gd-sidebar-width)]"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center px-5">
            <BizdinLogo compact={collapsed} markSize={collapsed ? "sm" : "md"} />
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
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
            <div className="mx-3 mb-3 rounded-2xl border border-[var(--gd-border)] bg-[var(--gd-surface-muted)] p-4 text-sm">
              <p className="font-bold text-[var(--gd-text-strong)]">Поддержка</p>
              <p className="mt-1 text-xs leading-5 text-[var(--gd-muted)]">
                Вопросы по кабинетам, голосованиям и профилю.
              </p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gd-muted)]">
                Bizdin Ui
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
