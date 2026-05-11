export function ChildMenuItem({
  active,
  icon,
  onClick,
  text,
}: {
  active?: boolean;
  icon: string;
  onClick: () => void;
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
      </span>
    </button>
  );
}
