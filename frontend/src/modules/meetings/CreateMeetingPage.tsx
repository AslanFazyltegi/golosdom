"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { addAstanaDays, formatAstanaDateKey } from "@/shared/lib/dateTime";
import {
  MeetingConfirmationPage,
  type MeetingConfirmationData,
} from "./MeetingConfirmationPage";

type MeetingStep = "form" | "confirmation";

const meetingFormLabels: Record<string, string> = {
  offline: "Очное собрание (Явочный формат)",
  absentee: "Заочное собрание (Письменный опрос / Электронное голосование)",
};

export function CreateMeetingPage(props: CabinetModuleProps) {
  const [step, setStep] = useState<MeetingStep>("form");
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState("offline");
  const [initiatorInput, setInitiatorInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [notificationDate, setNotificationDate] = useState(new Date());
  const [confirmationKey, setConfirmationKey] = useState("");
  const { meetingDate, setMeetingDate } = props;

  const minDateValue = getMinMeetingDateValue();

  useEffect(() => {
    if (!meetingDate) setMeetingDate(minDateValue);
  }, [meetingDate, minDateValue, setMeetingDate]);

  const owners = useMemo(
    () =>
      props.owners.map((owner) => ({
        id: owner.id,
        label: `${owner.full_name} (${owner.property_number})`,
      })),
    [props.owners],
  );

  function addInitiator(name: string) {
    const value = name.trim();
    if (!value || props.meetingInitiators.includes(value)) return;
    props.setMeetingInitiators([...props.meetingInitiators, value]);
  }

  function addTypedInitiator() {
    addInitiator(initiatorInput);
    setInitiatorInput("");
  }

  function removeInitiator(name: string) {
    props.setMeetingInitiators(
      props.meetingInitiators.filter((item) => item !== name),
    );
  }

  function updateAgenda(index: number, value: string) {
    props.setMeetingAgenda(
      props.meetingAgenda.map((item, i) => (i === index ? value : item)),
    );
  }

  function addAgendaItem() {
    props.setMeetingAgenda([...props.meetingAgenda, ""]);
  }

  function removeAgendaItem(index: number) {
    props.setMeetingAgenda(props.meetingAgenda.filter((_, i) => i !== index));
  }

  function moveAgendaItem(index: number, direction: "up" | "down") {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= props.meetingAgenda.length) return;

    const next = [...props.meetingAgenda];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    props.setMeetingAgenda(next);
  }

  function openConfirmation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError("");

    const agenda = props.meetingAgenda
      .map((item) => item.trim())
      .filter(Boolean);
    const meetingLocation = getMeetingLocation(
      props.meetingLocationAddress,
      props.meetingLocationDetail,
    );

    if (props.meetingInitiators.length === 0) {
      setValidationError("Укажите инициатора собрания");
      return;
    }

    if (!props.meetingDate) {
      setValidationError("Укажите дату проведения собрания");
      return;
    }

    if (props.meetingDate < minDateValue) {
      setValidationError(
        "Дата проведения должна быть не раньше 5-го календарного дня, считая со следующего дня.",
      );
      return;
    }

    if (!meetingLocation) {
      setValidationError("Укажите место проведения собрания");
      return;
    }

    if (agenda.length === 0) {
      setValidationError("Добавьте хотя бы один вопрос повестки");
      return;
    }

    setNotificationDate(new Date());
    setConfirmationKey(createMeetingDeduplicationKey());
    setOwnerDropdownOpen(false);
    setStep("confirmation");
  }

  const confirmationData: MeetingConfirmationData = {
    condominiumAddress: buildMeetingAddress(props.objects),
    meetingFormLabel: meetingFormLabels[meetingForm] || meetingForm,
    meetingDate: props.meetingDate,
    meetingTime: props.meetingTime,
    meetingLocation: getMeetingLocation(
      props.meetingLocationAddress,
      props.meetingLocationDetail,
    ),
    initiators: props.meetingInitiators,
    agenda: props.meetingAgenda.map((item) => item.trim()).filter(Boolean),
    notificationDate,
  };

  if (step === "confirmation") {
    return (
      <MeetingConfirmationPage
        creating={props.creatingMeeting}
        data={confirmationData}
        error={props.meetingError}
        onBack={() => setStep("form")}
        onConfirm={(notificationHtml) =>
          void props.submitMeeting({
            deduplicationKey: confirmationKey,
            meetingForm,
            notificationHtml,
          })
        }
      />
    );
  }

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold text-slate-900">
        Инициировать общедомовое собрание
      </h1>

      <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        <form onSubmit={openConfirmation}>
          <div className="border-b border-slate-200 p-7">
            <label className="mb-3 block font-semibold text-slate-800">
              Инициатор собрания <span className="text-red-500">*</span>
            </label>

            <div className="relative flex min-h-14 items-center gap-2 rounded-xl border border-slate-300 bg-white p-2 pr-52 shadow-sm focus-within:border-blue-500">
              {props.meetingInitiators.map((name) => (
                <span
                  key={name}
                  className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeInitiator(name)}
                    className="text-slate-400 hover:text-red-500"
                    title="Удалить"
                  >
                    ×
                  </button>
                </span>
              ))}

              <input
                value={initiatorInput}
                onChange={(e) => setInitiatorInput(e.target.value)}
                onBlur={addTypedInitiator}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTypedInitiator();
                  }
                }}
                className="min-w-52 flex-1 border-0 bg-transparent px-2 py-2 text-sm outline-none"
                placeholder="Введите инициатора вручную"
              />

              <button
                type="button"
                onClick={() => setOwnerDropdownOpen((value) => !value)}
                className="absolute right-2 top-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Выбрать из списка⌄
              </button>

              {ownerDropdownOpen && (
                <div className="absolute right-0 top-14 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  <p className="mb-2 text-sm font-bold text-slate-900">ОСИ:</p>
                  {["Председатель ОСИ", "Совет дома"].map((item) => {
                    const selected = props.meetingInitiators.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        disabled={selected}
                        onClick={() => addInitiator(item)}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                          selected
                            ? "cursor-not-allowed text-slate-400"
                            : "text-slate-700 hover:bg-blue-50"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}

                  <div className="my-2 border-t border-slate-200" />

                  <p className="mb-2 text-sm font-bold text-slate-900">
                    Собственник:
                  </p>
                  <div className="max-h-[320px] overflow-y-auto pr-1">
                    {owners.map((owner) => {
                      const selected = props.meetingInitiators.includes(
                        owner.label,
                      );

                      return (
                        <button
                          key={owner.id}
                          type="button"
                          disabled={selected}
                          onClick={() => addInitiator(owner.label)}
                          className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                            selected
                              ? "cursor-not-allowed text-slate-400"
                              : "hover:bg-blue-50"
                          }`}
                        >
                          {owner.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Можно ввести инициатора вручную или выбрать из списка. Повторно
              одного и того же человека добавить нельзя.
            </p>
          </div>

          <div className="grid gap-0 border-b border-slate-200 xl:grid-cols-2">
            <div className="border-b border-slate-200 p-7 xl:border-b-0 xl:border-r">
              <label className="mb-3 block font-semibold text-slate-800">
                Дата проведения <span className="text-red-500">*</span>
              </label>
              <div className="grid max-w-xl grid-cols-2 gap-4">
                <input
                  className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none focus:border-blue-500"
                  type="date"
                  min={minDateValue}
                  value={props.meetingDate}
                  onChange={(e) => props.setMeetingDate(e.target.value)}
                />
                <input
                  className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none focus:border-blue-500"
                  type="time"
                  value={props.meetingTime}
                  onChange={(e) => props.setMeetingTime(e.target.value)}
                />
              </div>
              <p className="mt-3 max-w-md text-sm leading-5 text-slate-500">
                Дата доступна с 5-го календарного дня, считая со следующего дня.
                Например: 1 мая → 6 мая.
              </p>
            </div>

            <div className="p-7">
              <label className="mb-3 block font-semibold text-slate-800">
                Место проведения <span className="text-red-500">*</span>
              </label>
              <div className="mb-3 flex gap-2">
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none focus:border-blue-500"
                  value={props.meetingLocationAddress ?? ""}
                  onChange={(e) =>
                    props.setMeetingLocationAddress(e.target.value)
                  }
                  placeholder="Адрес дома"
                />

                <button
                  type="button"
                  onClick={() =>
                    props.setMeetingLocationAddress(
                      buildMeetingAddress(props.objects),
                    )
                  }
                  className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
                >
                  Адрес по умолчанию
                </button>
              </div>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none focus:border-blue-500"
                placeholder="Двор / паркинг / офис ОСИ / 1-5 подъезд"
                value={props.meetingLocationDetail}
                onChange={(e) => props.setMeetingLocationDetail(e.target.value)}
              />
              <p className="mt-3 text-sm leading-5 text-slate-500">
                Уточните место проведения: двор, паркинг, офис ОСИ, подъезд и
                т.д.
              </p>
            </div>

            <div className="border-b border-slate-200 p-7 xl:border-b-0 xl:border-r">
              <label className="mb-3 block font-semibold text-slate-800">
                Форма собрания <span className="text-red-500">*</span>
              </label>

              <select
                className="w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none focus:border-blue-500"
                value={meetingForm}
                onChange={(e) => setMeetingForm(e.target.value)}
              >
                <option value="offline">Очное собрание (Явочный формат)</option>
                <option value="absentee">
                  Заочное собрание (Письменный опрос / Электронное голосование)
                </option>
              </select>

              <p className="mt-3 text-sm leading-5 text-slate-500">
                Выберите формат проведения общедомового собрания.
              </p>
            </div>
          </div>

          <div className="border-b border-slate-200 p-7">
            <label className="mb-4 block font-semibold text-slate-800">
              Основные вопросы повестки <span className="text-red-500">*</span>
            </label>

            <div className="space-y-3">
              {props.meetingAgenda.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[28px_56px_1fr_48px_48px_48px] items-stretch gap-3"
                >
                  <div className="flex items-center justify-center text-xl leading-none text-slate-300">
                    ⋮⋮
                  </div>
                  <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm">
                    {index + 1}
                  </div>
                  <input
                    className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none focus:border-blue-500"
                    value={item}
                    onChange={(e) => updateAgenda(index, e.target.value)}
                    placeholder="Вопрос обсуждения"
                  />
                  <button
                    type="button"
                    onClick={() => moveAgendaItem(index, "up")}
                    disabled={index === 0}
                    className="rounded-xl border border-slate-200 text-xl shadow-sm hover:bg-slate-50 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveAgendaItem(index, "down")}
                    disabled={index === props.meetingAgenda.length - 1}
                    className="rounded-xl border border-slate-200 text-xl shadow-sm hover:bg-slate-50 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAgendaItem(index)}
                    className="rounded-xl border border-red-100 text-red-500 shadow-sm hover:bg-red-50"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addAgendaItem}
              className="mt-5 rounded-xl border border-blue-300 px-5 py-3 font-medium text-blue-600 hover:bg-blue-50"
            >
              + Добавить вопрос
            </button>
          </div>

          <div className="p-7">
            {(validationError || props.meetingError) && (
              <p className="mb-4 text-sm text-red-600">
                {validationError || props.meetingError}
              </p>
            )}

            <button
              type="submit"
              className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Далее
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function getMinMeetingDateValue() {
  return formatAstanaDateKey(addAstanaDays(new Date(), 5));
}

function createMeetingDeduplicationKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `meeting-${crypto.randomUUID()}`;
  }

  return `meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getMeetingLocation(address: string, detail: string) {
  return [address.trim(), detail.trim()].filter(Boolean).join(", ");
}

function buildMeetingAddress(objects: unknown) {
  if (!objects || Array.isArray(objects)) return "Адрес дома не найден";

  const building = objects as Record<string, unknown>;

  return [
    building.city,
    building.district,
    building.building_name,
    building.street ? `ул. ${building.street}` : "",
    building.house_number ? `д. ${building.house_number}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
