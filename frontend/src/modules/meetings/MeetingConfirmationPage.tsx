"use client";

import { useState } from "react";
import type { ReactNode } from "react";

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
  meeting?: any;
  mode?: "create" | "preview";
  error?: string;
  onBack?: () => void;
  onConfirm?: () => void;
};

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
                {preparedData.notificationDate.toLocaleDateString("ru-RU")}
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
                onClick={onConfirm}
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

function buildConfirmationDataFromMeeting(meeting: any): MeetingConfirmationData {
  const scheduledAt = meeting?.scheduled_at
    ? new Date(meeting.scheduled_at)
    : null;

  const meetingDate =
    scheduledAt && !Number.isNaN(scheduledAt.getTime())
      ? scheduledAt.toISOString().slice(0, 10)
      : "";

  const meetingTime =
    scheduledAt && !Number.isNaN(scheduledAt.getTime())
      ? scheduledAt.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return {
    condominiumAddress:
      meeting?.condominium_address ||
      meeting?.building_address ||
      meeting?.address ||
      meeting?.location ||
      "",
    meetingFormLabel:
      meeting?.meeting_form_label ||
      meeting?.meeting_format ||
      "Очное собрание (Явочный формат)",
    meetingDate,
    meetingTime,
    meetingLocation: meeting?.location || "",
    initiators: splitInitiators(meeting?.initiator_name),
    agenda: Array.isArray(meeting?.agenda) ? meeting.agenda : [],
    notificationDate: meeting?.created_at
      ? new Date(meeting.created_at)
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
  if (!value) return "";

  return new Date(`${value}T00:00`).toLocaleDateString("ru-RU");
}