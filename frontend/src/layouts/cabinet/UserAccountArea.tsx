import { useEffect, useRef, useState } from "react";
import { apiAssetUrl } from "@/lib/api";
import type { User } from "@/types/user";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import { AccountDropdown } from "./AccountDropdown";

export function UserAccountArea({
  accountOpen,
  activeRole,
  logout,
  onOpenModule,
  setAccountOpen,
  switchRole,
  user,
}: {
  accountOpen: boolean;
  activeRole: string;
  logout: () => void;
  onOpenModule: (code: string) => void;
  setAccountOpen: (value: boolean) => void;
  switchRole: (role: string) => void;
  user: User;
}) {
  const name = user.full_name?.trim() || user.email || "Пользователь";
  const initials = getInitials(name);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [displayRole, setDisplayRole] = useState(activeRole);

    useEffect(() => {
      setDisplayRole(activeRole);
    }, [activeRole]);

  useEffect(() => {
    if (!accountOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setAccountOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, setAccountOpen]);

async function closeAfter(action: () => void | Promise<void>) {
  await action();
  setAccountOpen(false);
}

async function handleRoleSwitch(role: string) {
  if (role === displayRole) {
    setAccountOpen(false);
    return;
  }

  const previousRole = displayRole;
  setDisplayRole(role);
  setAccountOpen(false);

  try {
    await switchRole(role);
  } catch (error) {
    setDisplayRole(previousRole);
    throw error;
  }
}

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setAccountOpen(!accountOpen)}
        className="flex h-10 items-center gap-2 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] px-2 shadow-sm transition hover:bg-[var(--gd-primary-faint)] sm:px-3"
      >
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={apiAssetUrl(user.photo)}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gd-primary-soft)] text-sm font-black text-[var(--gd-primary)]">
            {initials}
          </div>
        )}

        <div className="hidden min-w-0 text-right sm:block">
          <p className="max-w-44 truncate text-sm font-bold text-[var(--gd-text-strong)] lg:max-w-56">
            {name}
          </p>
          <p className="text-xs font-semibold text-[var(--gd-muted)]">
            {roleLabel(displayRole)}
          </p>
        </div>

        <span className="text-[var(--gd-muted)]">⌄</span>
      </button>

      {accountOpen && (
        <AccountDropdown
          activeRole={displayRole}
          onOpenModule={(code) => void closeAfter(() => onOpenModule(code))}
          switchRole={(role) => void handleRoleSwitch(role)}
          logout={() => void closeAfter(logout)}
          user={user}
        />
      )}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "GD";
}
