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
      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
        danger
          ? "text-[var(--gd-danger)] hover:bg-[var(--gd-danger-soft)]"
          : "text-[var(--gd-text)] hover:bg-[var(--gd-surface-muted)]"
      }`}
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}
