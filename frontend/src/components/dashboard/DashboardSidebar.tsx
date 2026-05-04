import type { NavigationItem } from "@/types/navigation";

type Props = {
  menu: NavigationItem[];
  view: string;
  activeComponent: string;
  expandedMenuCodes: string[];
  onOpenItem: (item: NavigationItem) => void;
};

export function DashboardSidebar({
  menu,
  view,
  activeComponent,
  expandedMenuCodes,
  onOpenItem,
}: Props) {
  return (
    <aside className="fixed left-0 top-20 h-[calc(100vh-80px)] w-72 overflow-y-auto border-r bg-white p-5">
      <nav className="space-y-2">
        {menu.map((item) => {
          const isExpanded = expandedMenuCodes.includes(item.code);
          const hasChildren = item.children && item.children.length > 0;

          return (
            <div key={item.code}>
              <MenuItem
                icon={item.icon}
                text={item.title}
                active={view === "dashboard" && activeComponent === item.component}
                hasChildren={hasChildren}
                expanded={isExpanded}
                onClick={() => onOpenItem(item)}
              />

              {hasChildren && isExpanded && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children.map((child) => (
                    <MenuItem
                      key={child.code}
                      icon={child.icon}
                      text={child.title}
                      active={view === "dashboard" && activeComponent === child.component}
                      small
                      onClick={() => onOpenItem(child)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function MenuItem({
  icon,
  text,
  active = false,
  small = false,
  hasChildren = false,
  expanded = false,
  onClick,
}: {
  icon: string;
  text: string;
  active?: boolean;
  small?: boolean;
  hasChildren?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl text-left font-medium ${
        small ? "px-3 py-2 text-xs" : "px-4 py-4 text-sm"
      } ${active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"}`}
    >
      <span className="flex items-center gap-3">
        <span className={small ? "text-base" : "text-xl"}>{icon}</span>
        <span>{text}</span>
      </span>

      {hasChildren && (
        <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
      )}
    </button>
  );
}