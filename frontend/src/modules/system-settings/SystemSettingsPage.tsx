"use client";

import { useState } from "react";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import {
  AppButton,
  AppPageHeader,
} from "@/shared/ui/design-system";

type SettingsState = {
  language: "ru" | "kk";
  theme: "light" | "dark" | "system";
  systemNotifications: boolean;
  emailNotifications: boolean;
};

const DEFAULT_SETTINGS: SettingsState = {
  language: "ru",
  theme: "light",
  systemNotifications: true,
  emailNotifications: false,
};

const STORAGE_KEY = "golosdom.systemSettings";

export function SystemSettingsPage({ user }: CabinetModuleProps) {
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [message, setMessage] = useState("");

  function updateSettings(next: Partial<SettingsState>) {
    setSettings((current) => {
      const updated = { ...current, ...next };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  function showPlaceholder(text: string) {
    setMessage(text);
  }

  return (
    <main className="gd-settings-page min-h-full">
      <AppPageHeader title="Настройки системы" description="Кабинет пользователя" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="gd-card md:p-8">
          <h2 className="mb-5 text-xl font-semibold text-[var(--gd-text-strong)]">Интерфейс</h2>

          <div className="mb-6">
            <p className="mb-3 font-medium text-[var(--gd-text-strong)]">Язык интерфейса</p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={settings.language === "ru"}
                onClick={() => updateSettings({ language: "ru" })}
              >
                Русский
              </ChoiceButton>
              <ChoiceButton
                active={settings.language === "kk"}
                onClick={() => updateSettings({ language: "kk" })}
              >
                Қазақша
              </ChoiceButton>
            </div>
          </div>

          <div>
            <p className="mb-3 font-medium text-[var(--gd-text-strong)]">Тема оформления</p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={settings.theme === "light"}
                onClick={() => updateSettings({ theme: "light" })}
              >
                Светлая
              </ChoiceButton>
              <ChoiceButton
                active={settings.theme === "dark"}
                onClick={() => updateSettings({ theme: "dark" })}
              >
                Тёмная
              </ChoiceButton>
              <ChoiceButton
                active={settings.theme === "system"}
                onClick={() => updateSettings({ theme: "system" })}
              >
                Системная
              </ChoiceButton>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="gd-card md:p-8">
            <h2 className="mb-5 text-xl font-semibold text-[var(--gd-text-strong)]">Уведомления</h2>
            <ToggleRow
              checked={settings.systemNotifications}
              description="Публикация голосований, изменения статусов, новые сообщения."
              label="Системные уведомления"
              onChange={(value) =>
                updateSettings({ systemNotifications: value })
              }
            />
            <ToggleRow
              checked={settings.emailNotifications}
              description="Дублировать важные события на email."
              label="Email-уведомления"
              onChange={(value) => updateSettings({ emailNotifications: value })}
            />
          </section>

          <section className="gd-card md:p-8">
            <h2 className="mb-5 text-xl font-semibold text-[var(--gd-text-strong)]">Безопасность</h2>
            <div className="flex flex-wrap gap-3">
              <AppButton
                onClick={() =>
                  showPlaceholder("Функция смены пароля будет добавлена позже.")
                }
              >
                Сменить пароль
              </AppButton>
              <AppButton
                onClick={() =>
                  showPlaceholder(
                    "Завершение других сессий будет добавлено позже.",
                  )
                }
              >
                Завершить другие сессии
              </AppButton>
            </div>
            {message && (
              <p className="gd-muted-panel mt-4 p-4 text-sm">
                {message}
              </p>
            )}
            <p className="mt-5 text-sm text-[var(--gd-muted)]">
              Пользователь: {user.email || "email не указан"}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function loadSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as SettingsState;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function ChoiceButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`gd-button ${
        active
          ? "gd-button-primary"
          : ""
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="mb-4 flex items-center justify-between gap-4 rounded-[var(--gd-radius-md)] border border-[var(--gd-border)] bg-[var(--gd-surface)] px-4 py-3">
      <span>
        <span className="block font-medium text-[var(--gd-text-strong)]">{label}</span>
        <span className="mt-1 block text-sm text-[var(--gd-muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[var(--gd-primary)]"
      />
    </label>
  );
}
