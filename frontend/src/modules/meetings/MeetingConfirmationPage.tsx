"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  formatAstanaDate,
  formatAstanaDateKey,
  formatAstanaTime,
} from "@/shared/lib/dateTime";

export type MeetingConfirmationData = {
  condominiumAddress: string;
  meetingFormLabel: string;
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
  initiators: string[];
  agenda: string[];
  notificationDate: Date;
};

type MeetingConfirmationPageProps = {
  creating?: boolean;
  data?: MeetingConfirmationData;
  meeting?: MeetingConfirmationSource;
  mode?: "create" | "preview";
  error?: string;
  onBack?: () => void;
  onConfirm?: (notificationHtml: string) => void;
};

type MeetingConfirmationSource = Record<string, unknown> | null | undefined;

function formatCondominiumAddress(address: string) {
  if (!address) return "";

  const parts = address.split(",").map((part) => part.trim());

  const [city, district, complex, street, house] = parts;

  return [
    city ? `г. ${city}` : "",
    district ? `р-н ${district}` : "",
    complex ? `ЖК ${complex}` : "",
    street || "",
    house || "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function MeetingConfirmationPage({
  creating = false,
  data,
  meeting,
  mode = "create",
  error,
  onBack,
  onConfirm,
}: MeetingConfirmationPageProps) {
  const [confirmed, setConfirmed] = useState(false);

  const preparedData = data ?? buildConfirmationDataFromMeeting(meeting);
  const formattedAddress = formatCondominiumAddress(
    preparedData.condominiumAddress
  );

  const isPreview = mode === "preview";

  function handleConfirm() {
    const notificationHtml =
      typeof document === "undefined"
        ? ""
        : document.getElementById("meeting-confirmation-document")?.outerHTML ??
          "";
    onConfirm?.(notificationHtml);
  }

  return (
    <>
      {!isPreview && (
        <h1 className="mb-8 text-3xl font-bold text-slate-900">
          Проверка уведомления
        </h1>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={isPreview ? "p-7" : "border-b border-slate-200 p-7"}>
            <div
              id="meeting-confirmation-document"
              style={{
                width: "794px",
                minHeight: "1123px",
                margin: "0 auto",
                padding: "56px",
                backgroundColor: "#ffffff",
                color: "#000000",
                border: "1px solid #d9e1ea",
                borderRadius: "12px",
                boxShadow: "0 1px 4px rgba(15, 23, 42, 0.12)",
                boxSizing: "border-box",
              }}
            >
              <article
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                  fontSize: "14pt",
                  lineHeight: "1",
                  color: "#000000",
                  textAlign: "justify",
                }}
              >
              <h2
                style={{
                  textAlign: "center",
                  fontSize: "16pt",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  marginBottom: "12px",
                }}
              >
                УВЕДОМЛЕНИЕ
              </h2>

              <p style={{
                  textAlign: "center",
                  fontWeight: 700,
                  margin: "0 auto 32px auto",
                  maxWidth: "640px",
                }}
                >
                о проведении собрания собственников квартир, нежилых помещений,
                парковочных мест и кладовых помещений по адресу:{" "}
                {formattedAddress}.
              </p>
              <div className="mt-8 space-y-5 text-justify leading-6">
                <p className="mt-8">
                  Собственникам квартир, нежилых помещений, парковочных мест и
                  кладовых помещений
                </p>

                <p className="mt-6">
                  «В соответствии со статьями 42-1 и 42-2 Закона РК «О жилищных
                  отношениях» и Правилами принятия решений по управлению объектом
                  кондоминиума и содержанию общего имущества объекта
                  кондоминиума, уведомляем вас о проведении общего собрания
                  собственников квартир и нежилых помещений по адресу:{" "}
                  {formattedAddress}».
                </p>
                <p>
                  В случае отсутствия кворума на очном собрании голосование будет продолжено посредством объекта информатизации в сфере жилищных отношений и жилищно-коммунального хозяйства начиная со следующего календарного дня после даты проведения собрания в порядке и сроки, предусмотренные законодательством Республики Казахстан.
                </p>
              </div>
              <DocumentPoint title="1. Формат проведения собрания:">
                {preparedData.meetingFormLabel}
              </DocumentPoint>

              <DocumentPoint title="2. Дата и время проведения:">
                {formatDate(preparedData.meetingDate)} в{" "}
                {preparedData.meetingTime}
              </DocumentPoint>

              <DocumentPoint title="3. Место проведения:">
                {preparedData.meetingLocation}
              </DocumentPoint>

              <DocumentPoint title="4. Инициатор собрания:">
                {preparedData.initiators.join(", ")}
              </DocumentPoint>

              <div style={{ marginTop: "20px" }}>
                <p style={{ fontWeight: 700, marginBottom: "8px" }}>
                  5. Повестка дня:
                </p>
                <ol style={{ marginTop: 0, paddingLeft: "24px" }}>
                  {preparedData.agenda.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ol>
              </div>

              <DocumentPoint title="6. Порядок ознакомления с материалами:">
                Материалы и информация по вопросам повестки дня предоставляются
                инициатором собрания для ознакомления собственникам по обращению
                до начала проведения собрания.
                <br />
                <br />С материалами можно ознакомиться по адресу:
                <br />
                {formattedAddress}, офис ОСИ.
              </DocumentPoint>

              <DocumentPoint title="7. Дата размещения уведомления:">
                {formatAstanaDate(preparedData.notificationDate)}
              </DocumentPoint>

              <DocumentPoint title="8. Способ уведомления собственников:">
                Уведомление размещается в общедоступных местах объекта
                кондоминиума, а также направляется собственникам посредством
                доступных каналов связи.
              </DocumentPoint>
            </article>
          </div>
        </div>

        {!isPreview && (
          <div className="space-y-4 p-7">
            {error && <p className="text-sm text-red-600">{error}</p>}

            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Подтверждаю корректность указанных данных
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Назад
              </button>

              <button
                type="button"
                disabled={!confirmed || creating}
                onClick={handleConfirm}
                className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Создаём..." : "Подтвердить и Опубликовать"}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function buildConfirmationDataFromMeeting(
  meeting: MeetingConfirmationSource,
): MeetingConfirmationData {
  const scheduledAt = stringValue(meeting?.scheduled_at);
  const meetingDate = formatAstanaDateKey(scheduledAt);
  const meetingTime = formatAstanaTime(scheduledAt);

  return {
    condominiumAddress:
      stringValue(meeting?.condominium_address) ||
      stringValue(meeting?.building_address) ||
      stringValue(meeting?.address) ||
      stringValue(meeting?.location) ||
      "",
    meetingFormLabel:
      stringValue(meeting?.meeting_form_label) ||
      stringValue(meeting?.meeting_format) ||
      "Очное собрание (Явочный формат)",
    meetingDate,
    meetingTime,
    meetingLocation: stringValue(meeting?.location),
    initiators: splitInitiators(stringValue(meeting?.initiator_name)),
    agenda: stringArrayValue(meeting?.agenda),
    notificationDate: stringValue(meeting?.created_at)
      ? new Date(stringValue(meeting?.created_at))
      : new Date(),
  };
}

function splitInitiators(value: string) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function DocumentPoint({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div style={{ marginTop: "20px" }}>
      <p style={{ fontWeight: 700, marginBottom: "8px" }}>{title}</p>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

function formatDate(value: string) {
  return formatAstanaDate(value);
}
