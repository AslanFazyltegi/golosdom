import type { NavigationItem } from "@/types/navigation";

type MobileNavEntry =
  | {
      key: string;
      label: string;
      icon: string;
      item: NavigationItem;
      primary?: boolean;
    }
  | {
      key: string;
      label: string;
      icon: string;
      moduleCode: string;
      primary?: boolean;
    };

export function MobileBottomNav({
  activeComponent,
  menu,
  onOpenItem,
  onOpenModule,
}: {
  activeComponent: string;
  menu: NavigationItem[];
  onOpenItem: (item: NavigationItem) => void;
  onOpenModule: (code: string) => void;
}) {
  const entries = buildMobileEntries(menu);

  return (
    <nav className="gd-mobile-bottom-nav" aria-label="Мобильная навигация">
      {entries.map((entry) => {
        const active = isEntryActive(entry, activeComponent);

        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => {
              if ("item" in entry) onOpenItem(entry.item);
              else onOpenModule(entry.moduleCode);
            }}
            className={[
              "gd-mobile-bottom-nav-item",
              entry.primary && "gd-mobile-bottom-nav-create",
              active && "gd-mobile-bottom-nav-item-active",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={active ? "page" : undefined}
          >
            <span className="gd-mobile-bottom-nav-icon" aria-hidden="true">
              {entry.icon}
            </span>
            <span>{entry.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function buildMobileEntries(menu: NavigationItem[]): MobileNavEntry[] {
  const dashboard = findMenuItem(menu, ["dashboard", "dashboard_summary"]);
  const objects = findMenuItem(menu, ["my_properties", "objects", "my_building"]);
  const create = findMenuItem(menu, [
    "voting_constructor_create",
    "meetings_create",
    "voting_constructor",
  ]);
  const voting = findMenuItem(menu, ["votings_active", "votings"]);
  const info = findMenuItem(menu, [
    "communication_news",
    "communication_announcements",
    "communication_notifications",
    "infocenter",
    "notifications",
  ]);

  const entries: MobileNavEntry[] = [];
  if (dashboard) entries.push(entryFromItem("home", "Главная", "⌂", dashboard));
  if (objects) entries.push(entryFromItem("objects", "Объекты", "▦", objects));

  if (create) {
    entries.push(entryFromItem("create", "Создать", "+", create, true));
  } else if (voting) {
    entries.push(entryFromItem("vote", "Голос", "✓", voting, true));
  }

  if (info) entries.push(entryFromItem("info", "Инфоцентр", "●", info));
  entries.push({
    key: "profile",
    label: "Профиль",
    icon: "◦",
    moduleCode: "profile",
  });

  return entries.slice(0, 5);
}

function entryFromItem(
  key: string,
  label: string,
  icon: string,
  item: NavigationItem,
  primary = false,
): MobileNavEntry {
  return {
    key,
    label,
    icon: item.icon || icon,
    item,
    primary,
  };
}

function findMenuItem(menu: NavigationItem[], candidates: string[]) {
  const items = flattenMenu(menu);
  return items.find((item) => {
    const component = getModuleCode(item);
    return candidates.includes(component) || candidates.includes(item.code);
  });
}

function flattenMenu(menu: NavigationItem[]): NavigationItem[] {
  return menu.flatMap((item) => [
    item,
    ...(item.children ? flattenMenu(item.children) : []),
  ]);
}

function getModuleCode(item: NavigationItem) {
  return item.component || item.code;
}

function isEntryActive(entry: MobileNavEntry, activeComponent: string) {
  if ("moduleCode" in entry) return entry.moduleCode === activeComponent;

  const item = entry.item;
  if (getModuleCode(item) === activeComponent) return true;

  return Boolean(
    item.children?.some((child) => getModuleCode(child) === activeComponent),
  );
}
