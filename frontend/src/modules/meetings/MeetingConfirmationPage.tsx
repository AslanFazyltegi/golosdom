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
  creating,
  data,
  error,
  onBack,
  onConfirm,
}: {
  creating: boolean;
  data: MeetingConfirmationData;
  error?: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const formattedAddress = formatCondominiumAddress(data.condominiumAddress);

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold text-slate-900">
        Проверка уведомления
      </h1>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-7">
          <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <article className="font-serif text-[15px] leading-7 text-slate-900">
              <h2 className="text-center text-xl font-bold uppercase tracking-wide">
                УВЕДОМЛЕНИЕ
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-center font-semibold">
                о проведении собрания собственников квартир, нежилых помещений,
                парковочных мест и кладовых помещений по адресу: {formattedAddress}.
              </p>

              <p className="mt-8">
                Собственникам квартир, нежилых помещений, парковочных мест и
                кладовых помещений
              </p>

              <p className="mt-6">
                «В соответствии со статьями 42-1 и 42-2 Закона РК «О жилищных отношениях» и Правилами принятия решений по управлению объектом кондоминиума и содержанию общего имущества объекта кондоминиума, уведомляем вас о проведении общего собрания собственников квартир и нежилых помещений по адресу: {formattedAddress}».
              </p>

              <DocumentPoint title="1. Формат проведения собрания:">
                {data.meetingFormLabel}
              </DocumentPoint>

              <DocumentPoint title="2. Дата и время проведения:">
                {formatDate(data.meetingDate)} в {data.meetingTime}
              </DocumentPoint>

              <DocumentPoint title="3. Место проведения:">
                {data.meetingLocation}
              </DocumentPoint>

              <DocumentPoint title="4. Инициатор собрания:">
                {data.initiators.join(", ")}
              </DocumentPoint>

              <div className="mt-5">
                <p className="font-bold">5. Повестка дня:</p>
                <ol className="mt-2 list-decimal space-y-1 pl-6">
                  {data.agenda.map((item) => (
                    <li key={item}>{item}</li>
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
                {data.notificationDate.toLocaleDateString("ru-RU")}
              </DocumentPoint>

              <DocumentPoint title="8. Способ уведомления собственников:">
                Уведомление размещается в общедоступных местах объекта
                кондоминиума, а также направляется собственникам посредством
                доступных каналов связи.
              </DocumentPoint>
            </article>
          </div>
        </div>

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
              {creating ? "Создаём..." : "Подтвердить и создать собрание"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function DocumentPoint({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="mt-5">
      <p className="font-bold">{title}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "";

  return new Date(`${value}T00:00`).toLocaleDateString("ru-RU");
}
