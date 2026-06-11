"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  changePassword,
  endOtherSessions,
  loadSystemSettings,
  saveSystemSettings,
  type SystemSettingsState,
} from "@/lib/system-settings";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import {
  AppButton,
  AppPageHeader,
} from "@/shared/ui/design-system";

type PasswordForm = {
  current_password: string;
  new_password: string;
  repeat_password: string;
};

const EMPTY_PASSWORD_FORM: PasswordForm = {
  current_password: "",
  new_password: "",
  repeat_password: "",
};

export function SystemSettingsPage({ user }: CabinetModuleProps) {
  const [settings, setSettings] =
    useState<SystemSettingsState>(loadSystemSettings);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] =
    useState<PasswordForm>(EMPTY_PASSWORD_FORM);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [endingSessions, setEndingSessions] = useState(false);

  function updateSettings(next: Partial<SystemSettingsState>) {
    const updated = saveSystemSettings({ ...settings, ...next });
    setSettings(updated);
    setNotice("Настройки сохранены");
    setActionError("");
  }

  function openPasswordModal() {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setActionError("");
    setNotice("");
    setPasswordOpen(true);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setNotice("");

    if (
      !passwordForm.current_password ||
      !passwordForm.new_password ||
      !passwordForm.repeat_password
    ) {
      setActionError("Заполните все поля смены пароля.");
      return;
    }

    if (passwordForm.new_password.length < 8) {
      setActionError("Новый пароль должен быть не короче 8 символов.");
      return;
    }

    if (passwordForm.new_password !== passwordForm.repeat_password) {
      setActionError("Новый пароль и повтор должны совпадать.");
      return;
    }

    try {
      setPasswordSaving(true);
      await changePassword(passwordForm);
      setPasswordOpen(false);
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setNotice("Пароль изменён");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Не удалось изменить пароль",
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  async function finishOtherSessions() {
    setActionError("");
    setNotice("");

    try {
      setEndingSessions(true);
      await endOtherSessions();
      setNotice("Другие сеансы завершены");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Не удалось завершить другие сеансы",
      );
    } finally {
      setEndingSessions(false);
    }
  }

  return (
    <main className="gd-settings-page min-h-full">
      <AppPageHeader title="Настройки системы" description="Кабинет пользователя" />

      {notice && (
        <section className="gd-alert gd-alert-success mb-6">{notice}</section>
      )}
      {actionError && (
        <section className="gd-alert gd-alert-danger mb-6">{actionError}</section>
      )}

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
              description="Публикация голосований, изменения статусов, новые сообщения внутри кабинета."
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
                onClick={openPasswordModal}
              >
                Сменить пароль
              </AppButton>
              <AppButton
                disabled={endingSessions}
                onClick={() => void finishOtherSessions()}
              >
                {endingSessions ? "Завершение..." : "Завершить другие сессии"}
              </AppButton>
            </div>
            <p className="mt-5 text-sm text-[var(--gd-muted)]">
              Пользователь: {user.email || "email не указан"}
            </p>
          </section>
        </div>
      </div>

      {passwordOpen && (
        <div className="gd-modal-overlay">
          <form onSubmit={submitPassword} className="gd-modal-panel max-w-lg">
            <div className="gd-modal-header">
              <div>
                <h2 className="text-xl font-semibold text-[var(--gd-text-strong)]">
                  Сменить пароль
                </h2>
                <p className="mt-1 text-sm text-[var(--gd-muted)]">
                  Новый пароль должен содержать минимум 8 символов.
                </p>
              </div>
            </div>

            <div className="gd-modal-body grid grid-cols-1 gap-4">
              <PasswordInput
                label="Текущий пароль"
                value={passwordForm.current_password}
                onChange={(value) =>
                  setPasswordForm((current) => ({
                    ...current,
                    current_password: value,
                  }))
                }
              />
              <PasswordInput
                label="Новый пароль"
                value={passwordForm.new_password}
                onChange={(value) =>
                  setPasswordForm((current) => ({
                    ...current,
                    new_password: value,
                  }))
                }
              />
              <PasswordInput
                label="Повтор нового пароля"
                value={passwordForm.repeat_password}
                onChange={(value) =>
                  setPasswordForm((current) => ({
                    ...current,
                    repeat_password: value,
                  }))
                }
              />
              {actionError && (
                <p className="gd-alert gd-alert-danger">{actionError}</p>
              )}
            </div>

            <div className="gd-modal-footer">
              <AppButton
                type="button"
                onClick={() => {
                  setPasswordOpen(false);
                  setPasswordForm(EMPTY_PASSWORD_FORM);
                  setActionError("");
                }}
              >
                Отмена
              </AppButton>
              <AppButton type="submit" disabled={passwordSaving} variant="primary">
                {passwordSaving ? "Сохранение..." : "Сохранить"}
              </AppButton>
            </div>
          </form>
        </div>
      )}
    </main>
  );
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

function PasswordInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="gd-label">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="gd-input mt-2"
      />
    </label>
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
