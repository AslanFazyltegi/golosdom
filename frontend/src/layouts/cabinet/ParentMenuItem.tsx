export function ParentMenuItem({
  active,
  collapsed,
  expanded,
  hasChildren,
  icon,
  onClick,
  unreadCount,
  text,
}: {
  active?: boolean;
  collapsed?: boolean;
  expanded?: boolean;
  hasChildren?: boolean;
  icon: string;
  onClick: () => void;
  unreadCount?: number;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? text : undefined}
      aria-expanded={hasChildren ? expanded : undefined}
      className={`group relative flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-3 text-left text-sm font-bold transition duration-200 ${
        active
          ? "bg-[var(--gd-primary-soft)] text-[var(--gd-primary-strong)] shadow-sm"
          : "text-[var(--gd-muted-strong)] hover:bg-[var(--gd-surface-muted)] hover:text-[var(--gd-text-strong)]"
      } ${collapsed ? "lg:justify-center lg:px-2" : ""}`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[var(--gd-primary)]" />
      )}
      <span
        className={`flex min-w-0 items-center gap-3 ${collapsed ? "lg:justify-center" : ""}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--gd-surface)] text-lg shadow-sm">
          {icon}
        </span>
        <span className={`min-w-0 truncate ${collapsed ? "lg:hidden" : ""}`}>
          {text}
        </span>
        {typeof unreadCount === "number" && unreadCount > 0 && (
          <span
            className={`rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white ${
              collapsed ? "lg:absolute lg:right-1 lg:top-1" : ""
            }`}
          >
            {unreadCount}
          </span>
        )}
      </span>

      {hasChildren && !collapsed && (
        <span
          className={`text-xs text-[var(--gd-muted)] transition-transform duration-200 ${
            expanded ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      )}
    </button>
  );
}
