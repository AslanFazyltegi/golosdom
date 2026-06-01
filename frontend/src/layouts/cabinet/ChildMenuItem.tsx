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
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium ${
        active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="text-base">{icon}</span>
        <span>{text}</span>
        {Boolean(unreadCount) && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
