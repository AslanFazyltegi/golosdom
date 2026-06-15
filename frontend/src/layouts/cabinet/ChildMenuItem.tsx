export function ChildMenuItem({
  active,
  icon,
  onClick,
  unreadCount,
  text,
}: {
  active?: boolean;
  icon: string;
  onClick: () => void;
  unreadCount?: number;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-left text-xs font-bold transition duration-200 ${
        active
          ? "bg-[var(--gd-primary-soft)] text-[var(--gd-primary)]"
          : "text-[var(--gd-muted)] hover:bg-[var(--gd-primary-faint)] hover:text-[var(--gd-primary)]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--gd-surface)] text-sm">
          {icon}
        </span>
        <span className="min-w-0 truncate">{text}</span>
        {typeof unreadCount === "number" && unreadCount > 0 && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--gd-accent)] px-1.5 text-[11px] font-black text-white">
            {unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
