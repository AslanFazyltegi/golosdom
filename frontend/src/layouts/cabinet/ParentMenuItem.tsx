export function ParentMenuItem({
  active,
  expanded,
  hasChildren,
  icon,
  onClick,
  text,
}: {
  active?: boolean;
  expanded?: boolean;
  hasChildren?: boolean;
  icon: string;
  onClick: () => void;
  text: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-4 py-4 text-left text-sm font-medium ${
        active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <span>{text}</span>
      </span>

      {hasChildren && (
        <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
      )}
    </button>
  );
}
