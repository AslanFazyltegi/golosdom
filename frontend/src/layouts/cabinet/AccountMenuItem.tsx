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
      className={`flex w-full items-center justify-between rounded-[var(--gd-radius-md)] px-4 py-3 text-left text-sm font-bold transition ${
        danger
          ? "text-[var(--gd-danger)] hover:bg-[var(--gd-danger-soft)]"
          : "text-[var(--gd-text)] hover:bg-[var(--gd-primary-faint)] hover:text-[var(--gd-primary)]"
      }`}
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}
