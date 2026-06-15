"use client";

import { useEffect, useState } from "react";
import {
  loadSystemSettings,
  saveSystemSettings,
  SYSTEM_SETTINGS_CHANGED_EVENT,
} from "@/lib/system-settings";
import { apiAssetUrl } from "@/lib/api";
import type { User } from "@/types/user";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import { AccountMenuItem } from "./AccountMenuItem";

export function AccountDropdown({
  activeRole,
  onOpenModule,
  switchRole,
  logout,
  user,
}: {
  activeRole: string;
  onOpenModule: (code: string) => void;
  switchRole: (role: string) => void;
  logout: () => void;
  user: User;
}) {
  const fullName = user.full_name?.trim() || "Не указано";
  const phone = user.phone || user.phone_number || "Телефон не указан";
  const initials = getInitials(fullName);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return getCurrentTheme();
  });

  useEffect(() => {
    function syncTheme() {
      setTheme(getCurrentTheme());
    }

    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncTheme);
    return () =>
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncTheme);
  }, []);

  function toggleTheme() {
    const currentSettings = loadSystemSettings();
    const next = theme === "dark" ? "light" : "dark";
    saveSystemSettings({ ...currentSettings, theme: next });
    setTheme(next);
  }

  return (
    <div className="absolute right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--gd-radius-xl)] border border-[var(--gd-border)] bg-[var(--gd-surface)] p-2 shadow-lg">
      <div className="flex gap-3 rounded-[var(--gd-radius-lg)] bg-[var(--gd-surface-muted)] px-4 py-4">
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={apiAssetUrl(user.photo)}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--gd-primary)] text-sm font-black text-white">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-bold leading-snug text-[var(--gd-text-strong)]">
            {fullName}
          </p>
          <p className="mt-1 truncate text-sm text-[var(--gd-muted)]">
            {phone}
          </p>
          <p className="mt-3 text-sm text-[var(--gd-muted-strong)]">
            Активная роль:{" "}
            <span className="font-bold text-[var(--gd-text-strong)]">
              {roleLabel(activeRole)}
            </span>
          </p>
        </div>
      </div>

      <div className="my-2 rounded-[var(--gd-radius-lg)] border border-[var(--gd-border)] bg-[var(--gd-surface-muted)] p-2">
        <p className="px-3 pb-2 text-xs font-black uppercase text-[var(--gd-muted)]">
          Сменить роль
        </p>
        {user.roles.map((role) => {
          const isActive = activeRole === role;

          return (
            <button
              key={role}
              onClick={() => {
                if (!isActive) switchRole(role);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                isActive
                  ? "bg-[var(--gd-primary)] text-white shadow-sm"
                  : "text-[var(--gd-muted-strong)] hover:bg-[var(--gd-surface)] hover:text-[var(--gd-text-strong)]"
              }`}
            >
              <span className="w-4 text-center">{isActive ? "✓" : ""}</span>
              <span>{roleLabel(role)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        className="mb-2 flex w-full items-center justify-between rounded-[var(--gd-radius-lg)] border border-[var(--gd-border)] px-4 py-3 text-left text-sm font-bold text-[var(--gd-text)] transition hover:bg-[var(--gd-primary-faint)]"
      >
        <span>{theme === "dark" ? "Темная тема" : "Светлая тема"}</span>
        <span className="rounded-full bg-[var(--gd-primary-soft)] px-3 py-1 text-xs font-black text-[var(--gd-primary)]">
          {theme === "dark" ? "Вкл" : "Выкл"}
        </span>
      </button>

      <AccountMenuItem onClick={() => onOpenModule("profile")}>
        Профиль
      </AccountMenuItem>

      <AccountMenuItem onClick={() => onOpenModule("system_settings")}>
        Настройки
      </AccountMenuItem>

      <div className="my-2 border-t border-[var(--gd-border)]" />

      <AccountMenuItem danger onClick={logout}>
        Выход
      </AccountMenuItem>
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

function getCurrentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
