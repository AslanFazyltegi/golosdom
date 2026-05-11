import type { NavigationItem } from "@/types/navigation";
import { ChildMenuItem } from "./ChildMenuItem";
import { ParentMenuItem } from "./ParentMenuItem";

export function CabinetSidebar({
  activeComponent,
  expandedMenuCodes,
  menu,
  onOpenItem,
}: {
  activeComponent: string;
  expandedMenuCodes: string[];
  menu: NavigationItem[];
  onOpenItem: (item: NavigationItem) => void;
}) {
  return (
    <aside className="fixed left-0 top-20 h-[calc(100vh-80px)] w-72 overflow-hidden border-r bg-white p-5">
      <nav className="space-y-2">
        {menu.map((item) => {
          const isExpanded = expandedMenuCodes.includes(item.code);
          const hasChildren = Boolean(item.children && item.children.length > 0);

          return (
            <div key={item.code}>
              <ParentMenuItem
                icon={item.icon}
                text={item.title}
                active={activeComponent === item.component}
                hasChildren={hasChildren}
                expanded={isExpanded}
                onClick={() => onOpenItem(item)}
              />

              {hasChildren && isExpanded && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children?.map((child) => (
                    <ChildMenuItem
                      key={child.code}
                      icon={child.icon}
                      text={child.title}
                      active={activeComponent === child.component}
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
