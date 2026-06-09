"use client";

import { FormEvent, useState } from "react";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import {
  AppButton,
  AppPageHeader,
} from "@/shared/ui/design-system";
import type { ProfileBuilding, UpdateProfilePayload } from "@/types/profile";

type FormState = UpdateProfilePayload;

export function ProfilePage({
  activeRole,
  profile,
  profileError,
  switchRole,
  updateProfile,
  user,
}: CabinetModuleProps) {
  const profileUser = profile?.user;
  const roles = profile?.roles?.length ? profile.roles : user.roles;
  const fullName = profileUser?.full_name?.trim() || "ФИО не указано";
  const email = profileUser?.email?.trim() || user.email || "Email не указан";
  const phone =
    profileUser?.phone || user.phone || user.phone_number || "Телефон не указан";
  const photo = profileUser?.photo || user.photo || "";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    buildFormState(fullName, profileUser?.phone, photo),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setSuccess("");

    try {
      await updateProfile(form);
      setEditing(false);
      setSuccess("Личные данные обновлены.");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Не удалось сохранить профиль",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="gd-profile-page min-h-full">
      <AppPageHeader title="Профиль" description="Кабинет пользователя" />

      {profileError && (
        <section className="gd-alert gd-alert-danger mb-6">
          {profileError}
        </section>
      )}
      {success && (
        <section className="gd-alert gd-alert-success mb-6">
          {success}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="gd-card md:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar name={fullName} photo={photo} size="large" />
              <div>
                <h2 className="text-xl font-semibold text-[var(--gd-text-strong)]">
                  Личные данные
                </h2>
                <p className="mt-1 text-sm text-[var(--gd-muted)]">
                  Данные учетной записи из БД
                </p>
              </div>
            </div>
            <AppButton
              onClick={() => {
                setForm(
                  buildFormState(
                    profileUser?.full_name || user.full_name || "",
                    profileUser?.phone || user.phone || user.phone_number || "",
                    profileUser?.photo || user.photo || "",
                  ),
                );
                setSaveError("");
                setSuccess("");
                setEditing(true);
              }}
            >
              Редактировать
            </AppButton>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--gd-muted)]">ФИО</p>
              <p className="mt-1 text-lg font-semibold text-[var(--gd-text-strong)]">
                {fullName}
              </p>
            </div>
            <InfoLine label="Email" value={email} />
            <InfoLine label="Телефон" value={phone} />
            <div className="gd-muted-panel p-4">
              <p className="text-sm text-[var(--gd-primary-strong)]">Активная роль</p>
              <p className="mt-1 font-semibold text-[var(--gd-text-strong)]">
                {roleLabel(activeRole)}
              </p>
            </div>
          </div>
        </section>

        <section className="gd-card md:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--gd-radius-md)] bg-[var(--gd-success-soft)] text-xl text-[var(--gd-success)]">
              🛡
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--gd-text-strong)]">Мои роли</h2>
              <p className="mt-1 text-sm text-[var(--gd-muted)]">
                Доступные роли пользователя
              </p>
            </div>
          </div>

          {roles.length === 0 ? (
            <p className="gd-muted-panel p-4">
              Роли пользователя пока не указаны.
            </p>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => {
                const isActive = role === activeRole;

                return (
                  <div
                    key={role}
                    className={`flex items-center justify-between gap-3 rounded-[var(--gd-radius-md)] border px-4 py-3 ${
                      isActive ? "border-[var(--gd-primary)] bg-[var(--gd-primary-soft)]" : "border-[var(--gd-border)] bg-[var(--gd-surface)]"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-[var(--gd-text-strong)]">
                        {roleLabel(role)}
                      </p>
                      {isActive && (
                        <p className="mt-1 text-sm text-[var(--gd-primary-strong)]">Активная роль</p>
                      )}
                    </div>

                    {!isActive && (
                      <AppButton
                        onClick={() => switchRole(role)}
                      >
                        Выбрать
                      </AppButton>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="gd-card mt-6 md:p-8">
        <h2 className="text-xl font-semibold text-[var(--gd-text-strong)]">Мой дом / ОСИ</h2>
        <p className="mt-1 text-sm text-[var(--gd-muted)]">
          Краткая информация по дому и обслуживающему ОСИ
        </p>

        {!profile ? (
          <p className="gd-muted-panel mt-6 p-5">
            Загрузка данных ОСИ...
          </p>
        ) : profile.osi.length === 0 ? (
          <div className="gd-muted-panel mt-6 p-5">
            <p>Данные ОСИ пока не указаны.</p>
            <p className="mt-2">
              У пользователя пока нет привязки к дому или ОСИ.
            </p>
            <p className="mt-2">
              Обратитесь к администратору или председателю ОСИ для проверки
              данных.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4">
            {profile.osi.map((osi) => (
              <article key={osi.id} className="rounded-[var(--gd-radius-md)] border border-[var(--gd-border)] bg-[var(--gd-surface)] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--gd-text-strong)]">
                      {osi.name}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--gd-muted-strong)]">
                      БИН: {osi.bin || "не указан"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--gd-muted-strong)]">
                      Адрес: {osi.address || "не указан"}
                    </p>
                  </div>
                  <div className="gd-alert gd-alert-success text-sm lg:min-w-72">
                    <p>
                      Председатель:{" "}
                      {osi.chairman?.full_name?.trim() || "не указан"}
                    </p>
                    <p className="mt-1">
                      Телефон: {osi.chairman?.phone || "Телефон не указан"}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-3 text-sm font-medium text-[var(--gd-text-strong)]">
                    Управляемые дома:
                  </p>
                  {osi.buildings.length === 0 ? (
                    <p className="text-sm text-[var(--gd-muted)]">
                      Дома для этого ОСИ пока не указаны.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm text-[var(--gd-muted-strong)]">
                      {osi.buildings.map((building) => (
                        <li key={building.id}>{formatBuilding(building)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <div className="gd-modal-overlay">
          <form
            onSubmit={submitProfile}
            className="gd-modal-panel max-w-2xl"
          >
            <div className="gd-modal-header">
              <div>
              <h2 className="text-xl font-semibold text-[var(--gd-text-strong)]">
                Редактировать личные данные
              </h2>
              <p className="mt-1 text-sm text-[var(--gd-muted)]">
                Email показывается только для просмотра.
              </p>
              </div>
            </div>

            <div className="gd-modal-body grid grid-cols-1 gap-4">
              <TextInput
                label="ФИО"
                value={form.full_name}
                onChange={(value) => setForm((current) => ({ ...current, full_name: value }))}
              />
              <ReadOnlyInput label="Email" value={email} />
              <TextInput
                label="Телефон"
                value={form.phone}
                onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
              />
              <TextInput
                label="Фото"
                value={form.photo}
                placeholder="URL или путь к фото"
                onChange={(value) => setForm((current) => ({ ...current, photo: value }))}
              />

            {saveError && (
              <p className="gd-alert gd-alert-danger">
                {saveError}
              </p>
            )}
            </div>

            <div className="gd-modal-footer">
              <AppButton
                type="button"
                onClick={() => {
                  setEditing(false);
                  setSaveError("");
                }}
              >
                Отмена
              </AppButton>
              <AppButton
                type="submit"
                disabled={saving}
                variant="primary"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </AppButton>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-[var(--gd-muted)]">{label}</p>
      <p className="mt-1 font-medium text-[var(--gd-text-strong)]">{value}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="gd-label">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="gd-input mt-2"
      />
    </label>
  );
}

function ReadOnlyInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="gd-label">{label}</span>
      <input
        value={value}
        readOnly
        className="gd-input mt-2 bg-[var(--gd-surface-muted)] text-[var(--gd-muted)]"
      />
      <span className="gd-hint">нельзя изменить</span>
    </label>
  );
}

function Avatar({
  name,
  photo,
  size,
}: {
  name: string;
  photo: string;
  size: "large";
}) {
  const className =
    size === "large"
      ? "h-16 w-16 rounded-2xl object-cover"
      : "h-10 w-10 rounded-full object-cover";

  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className={className} />;
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-[var(--gd-radius-md)] bg-[var(--gd-primary-soft)] text-lg font-semibold text-[var(--gd-primary-strong)]">
      {getInitials(name)}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "👤";
}

function buildFormState(
  fullName: string,
  phone?: string | null,
  photo?: string | null,
): FormState {
  return {
    full_name: fullName === "ФИО не указано" ? "" : fullName,
    phone: phone || "",
    photo: photo || "",
  };
}

function formatBuilding(building: ProfileBuilding) {
  const name = building.building_name || "Дом";
  const address = [
    building.city,
    building.district,
    building.street,
    formatHouse(building),
  ]
    .filter(Boolean)
    .join(", ");

  return address ? `${name}, ${address}` : name;
}

function formatHouse(building: ProfileBuilding) {
  const number = building.house_number;
  const fraction = building.house_fraction;

  if (!number) return "";

  return `д. ${[number, fraction].filter(Boolean).join("/")}`;
}
