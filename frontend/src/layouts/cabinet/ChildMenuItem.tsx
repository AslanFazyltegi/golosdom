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
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition duration-200 ${
        active
          ? "bg-[var(--gd-primary-soft)] text-[var(--gd-primary-strong)]"
          : "text-[var(--gd-muted-strong)] hover:bg-[var(--gd-surface-muted)] hover:text-[var(--gd-text-strong)]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--gd-surface)] text-sm">
          {icon}
        </span>
        <span className="min-w-0 truncate">{text}</span>
        {typeof unreadCount === "number" && unreadCount > 0 && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white">
            {unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
