"use client";

import { useState } from "react";
import type { CabinetModuleProps } from "@/shared/types/cabinet";

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
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-950">
          Настройки системы
        </h1>
        <p className="mt-2 text-slate-500">Кабинет пользователя</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="rounded-2xl border bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-5 text-xl font-semibold">Интерфейс</h2>

          <div className="mb-6">
            <p className="mb-3 font-medium">Язык интерфейса</p>
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
            <p className="mb-3 font-medium">Тема оформления</p>
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
          <section className="rounded-2xl border bg-white p-6 shadow-sm md:p-8">
            <h2 className="mb-5 text-xl font-semibold">Уведомления</h2>
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

          <section className="rounded-2xl border bg-white p-6 shadow-sm md:p-8">
            <h2 className="mb-5 text-xl font-semibold">Безопасность</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() =>
                  showPlaceholder("Функция смены пароля будет добавлена позже.")
                }
                className="rounded-xl border px-4 py-2 hover:bg-slate-50"
              >
                Сменить пароль
              </button>
              <button
                onClick={() =>
                  showPlaceholder(
                    "Завершение других сессий будет добавлено позже.",
                  )
                }
                className="rounded-xl border px-4 py-2 hover:bg-slate-50"
              >
                Завершить другие сессии
              </button>
            </div>
            {message && (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                {message}
              </p>
            )}
            <p className="mt-5 text-sm text-slate-500">
              Пользователь: {user.email || "email не указан"}
            </p>
          </section>
        </div>
      </div>
    </>
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
      className={`rounded-xl border px-4 py-2 text-sm ${
        active
          ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
          : "hover:bg-slate-50"
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
    <label className="mb-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}
