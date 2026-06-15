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
      className={`group relative flex h-10 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-left text-[13px] font-bold transition duration-200 ${
        active
          ? "bg-[var(--gd-primary-soft)] text-[var(--gd-primary)]"
          : "text-[var(--gd-muted)] hover:bg-[var(--gd-primary-faint)] hover:text-[var(--gd-primary)]"
      } ${collapsed ? "lg:justify-center lg:px-2" : ""}`}
    >
      <span
        className={`flex min-w-0 items-center gap-2.5 ${collapsed ? "lg:justify-center" : ""}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gd-surface)] text-base">
          {icon}
        </span>
        <span className={`min-w-0 truncate ${collapsed ? "lg:hidden" : ""}`}>
          {text}
        </span>
        {typeof unreadCount === "number" && unreadCount > 0 && (
          <span
            className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--gd-accent)] px-1.5 text-[11px] font-black text-white ${
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
