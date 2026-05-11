import type { ReactNode } from "react";

export function AccountMenuItem({
  children,
  danger = false,
  onClick,
  trailing,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left hover:bg-slate-50 ${
        danger ? "text-red-600 hover:bg-red-50" : ""
      }`}
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}
