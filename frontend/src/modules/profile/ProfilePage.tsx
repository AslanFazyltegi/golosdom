"use client";

import { FormEvent, useState } from "react";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
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
  const ercAccount = profileUser?.erc_account || "Не указан";
  const photo = profileUser?.photo || user.photo || "";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    buildFormState(fullName, profileUser?.phone, profileUser?.erc_account, photo),
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
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-950">Профиль</h1>
        <p className="mt-2 text-slate-500">Кабинет пользователя</p>
      </div>

      {profileError && (
        <section className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-5 text-red-700 shadow-sm">
          {profileError}
        </section>
      )}
      {success && (
        <section className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-800 shadow-sm">
          {success}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar name={fullName} photo={photo} size="large" />
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Личные данные
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Данные учетной записи из БД
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setForm(
                  buildFormState(
                    profileUser?.full_name || user.full_name || "",
                    profileUser?.phone || user.phone || user.phone_number || "",
                    profileUser?.erc_account || user.erc_account || "",
                    profileUser?.photo || user.photo || "",
                  ),
                );
                setSaveError("");
                setSuccess("");
                setEditing(true);
              }}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Редактировать
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">ФИО</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {fullName}
              </p>
            </div>
            <InfoLine label="Email" value={email} />
            <InfoLine label="Телефон" value={phone} />
            <InfoLine label="Лицевой счет ЕРЦ" value={ercAccount} />
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm text-blue-700">Активная роль</p>
              <p className="mt-1 font-semibold text-blue-900">
                {roleLabel(activeRole)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
              🛡
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Мои роли</h2>
              <p className="mt-1 text-sm text-slate-500">
                Доступные роли пользователя
              </p>
            </div>
          </div>

          {roles.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-slate-600">
              Роли пользователя пока не указаны.
            </p>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => {
                const isActive = role === activeRole;

                return (
                  <div
                    key={role}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                      isActive ? "border-blue-200 bg-blue-50" : "bg-white"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-slate-950">
                        {roleLabel(role)}
                      </p>
                      {isActive && (
                        <p className="mt-1 text-sm text-blue-700">
                          ✓ Активная роль
                        </p>
                      )}
                    </div>

                    {!isActive && (
                      <button
                        onClick={() => switchRole(role)}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        Выбрать
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold text-slate-950">Мой дом / ОСИ</h2>
        <p className="mt-1 text-sm text-slate-500">
          Краткая информация по дому и обслуживающему ОСИ
        </p>

        {!profile ? (
          <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-slate-600">
            Загрузка данных ОСИ...
          </p>
        ) : profile.osi.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-slate-600">
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
              <article key={osi.id} className="rounded-2xl border p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">
                      {osi.name}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      БИН: {osi.bin || "не указан"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Адрес: {osi.address || "не указан"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 lg:min-w-72">
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
                  <p className="mb-3 text-sm font-medium text-slate-700">
                    Управляемые дома:
                  </p>
                  {osi.buildings.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Дома для этого ОСИ пока не указаны.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm text-slate-600">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <form
            onSubmit={submitProfile}
            className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-lg"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-950">
                Редактировать личные данные
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Email показывается только для просмотра.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
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
                label="Лицевой счет ЕРЦ"
                value={form.erc_account}
                onChange={(value) =>
                  setForm((current) => ({ ...current, erc_account: value }))
                }
              />
              <TextInput
                label="Фото"
                value={form.photo}
                placeholder="URL или путь к фото"
                onChange={(value) => setForm((current) => ({ ...current, photo: value }))}
              />
            </div>

            {saveError && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {saveError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setSaveError("");
                }}
                className="rounded-xl border px-4 py-2 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
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
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-400"
      />
    </label>
  );
}

function ReadOnlyInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        value={value}
        readOnly
        className="mt-2 w-full rounded-xl border bg-slate-50 px-4 py-3 text-slate-500 outline-none"
      />
      <span className="mt-1 block text-xs text-slate-500">нельзя изменить</span>
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
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-lg font-semibold text-blue-700">
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
  ercAccount?: string | null,
  photo?: string | null,
): FormState {
  return {
    full_name: fullName === "ФИО не указано" ? "" : fullName,
    phone: phone || "",
    erc_account: ercAccount || "",
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
