"use client";

import { useMemo, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";
import { MeetingConfirmationPage } from "@/modules/meetings/MeetingConfirmationPage";

type MeetingsListMode = "upcoming" | "active" | "past";

export function MeetingsPage() {
  return (
    <Placeholder
      title="Общедомовые собрания"
      text="Выберите подпункт: активные, предстоящие, прошедшие, на утверждение или на доработке."
    />
  );
}

export function UpcomingMeetingsPage(props: CabinetModuleProps) {
  return (
    <MeetingsListTemplate
      title="Предстоящие собрания"
      mode="upcoming"
      {...props}
    />
  );
}

export function ActiveMeetingsPage(props: CabinetModuleProps) {
  return (
    <MeetingsListTemplate
      title="Активные собрания"
      mode="active"
      {...props}
    />
  );
}

export function PastMeetingsPage(props: CabinetModuleProps) {
  return (
    <MeetingsListTemplate
      title="Прошедшие собрания"
      mode="past"
      {...props}
    />
  );
}

export function ApprovalMeetingsPage() {
  return (
    <Placeholder
      title="Собрания на утверждении"
      text="Модуль пока не подключён к рабочему списку собраний на фронте."
    />
  );
}

export function RevisionMeetingsPage() {
  return (
    <Placeholder
      title="Собрания на доработке"
      text="Модуль пока не подключён к рабочему списку собраний на фронте."
    />
  );
}

function MeetingsListTemplate({
  title,
  mode,
  meetings,
  meetingError,
}: CabinetModuleProps & {
  title: string;
  mode: MeetingsListMode;
}) {
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);

  const visibleMeetings = useMemo(() => {
    const sortedAsc = [...meetings].sort((a, b) =>
      String(a.scheduled_at ?? "").localeCompare(String(b.scheduled_at ?? ""))
    );

    if (mode === "upcoming") {
      return sortedAsc.filter(
        (meeting) => getMeetingStatusByDate(meeting.scheduled_at) === "upcoming"
      );
    }

    if (mode === "active") {
      return sortedAsc.filter(
        (meeting) => getMeetingStatusByDate(meeting.scheduled_at) === "active"
      );
    }

    if (mode === "past") {
      return sortedAsc
        .filter(
          (meeting) => getMeetingStatusByDate(meeting.scheduled_at) === "past"
        )
        .reverse();
    }

    return sortedAsc;
  }, [meetings, mode]);

  const handlePrint = (meeting: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(buildMeetingPrintPageHtml(meeting));
    printWindow.document.close();
    printWindow.focus();

    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const handleDownloadPdf = async (meeting: any) => {
    const iframe = document.createElement("iframe");

    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const iframeDocument =
      iframe.contentDocument || iframe.contentWindow?.document;

    if (!iframeDocument) {
      document.body.removeChild(iframe);
      return;
    }

    iframeDocument.open();
    iframeDocument.write(`
      <html>
        <head>
          <style>${getPrintStyles()}</style>
        </head>
        <body>
          ${buildMeetingPrintDocumentHtml(meeting)}
        </body>
      </html>
    `);
    iframeDocument.close();

    const element = iframeDocument.getElementById(
      "meeting-print-document"
    ) as HTMLElement | null;

    if (!element) {
      document.body.removeChild(iframe);
      return;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth - 30;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 15;

      pdf.addImage(imgData, "PNG", 15, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 30;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 15;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 15, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - 30;
      }

      pdf.save(`uvedomlenie-sobranie-${meeting.id}.pdf`);
    } finally {
      document.body.removeChild(iframe);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {mode === "active"
            ? "Отображаются собрания, которые состоятся сегодня."
            : "Собрания отсортированы по ближайшей дате и времени."}
        </p>
      </div>

      {meetingError && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
          {meetingError}
        </section>
      )}

      {visibleMeetings.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-slate-600">Данных по этому разделу пока нет.</p>
        </section>
      )}

      <div className="grid gap-5">
        {visibleMeetings.map((meeting) => {
          const calculatedStatus = getMeetingStatusByDate(meeting.scheduled_at);

          return (
            <section
              key={meeting.id}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                        calculatedStatus
                      )}`}
                    >
                      {translateStatus(calculatedStatus)}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        isOnlineMeeting(meeting)
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {translateMeetingFormat(meeting)}
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {formatMeetingDateTime(meeting.scheduled_at)}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900">
                    Общедомовое собрание
                  </h2>

                  <p className="mt-2 text-sm text-slate-600">
                    <b>Инициатор:</b> {meeting.initiator_name}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    <b>Место:</b> {meeting.location}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMeeting(meeting)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Подробнее
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrint(meeting)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Печать
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(meeting)}
                    className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Скачать PDF
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Повестка:
                </p>

                <ul className="space-y-1 text-sm text-slate-600">
                  {(meeting.agenda ?? []).slice(0, 3).map((item: string) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>

                {(meeting.agenda ?? []).length > 3 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Ещё пунктов: {(meeting.agenda ?? []).length - 3}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selectedMeeting && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-slate-100 p-6 shadow-xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMeeting(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <MeetingConfirmationPage
              meeting={selectedMeeting}
              mode="preview"
              creating={false}
              onBack={() => setSelectedMeeting(null)}
              onConfirm={() => {}}
            />
          </div>
        </div>
      )}
    </>
  );
}

function buildMeetingPrintPageHtml(meeting: any) {
  return `
    <html>
      <head>
        <title>Уведомление о собрании</title>
        <style>${getPrintStyles()}</style>
      </head>
      <body>
        ${buildMeetingPrintDocumentHtml(meeting)}
      </body>
    </html>
  `;
}

function buildMeetingPrintDocumentHtml(meeting: any) {
  const address = getFormattedAddress(meeting);
  const agenda = Array.isArray(meeting?.agenda) ? meeting.agenda : [];

  return `
    <div id="meeting-print-document">
      <h1>УВЕДОМЛЕНИЕ</h1>

      <p class="subtitle">
        о проведении собрания собственников квартир, нежилых помещений,
        парковочных мест и кладовых помещений по адресу: ${escapeHtml(address)}.
      </p>

      <p>
        Собственникам квартир, нежилых помещений, парковочных мест и кладовых помещений
      </p>

      <p>
        «В соответствии со статьями 42-1 и 42-2 Закона РК «О жилищных отношениях»
        и Правилами принятия решений по управлению объектом кондоминиума и
        содержанию общего имущества объекта кондоминиума, уведомляем вас о
        проведении общего собрания собственников квартир и нежилых помещений
        по адресу: ${escapeHtml(address)}».
      </p>

      <div class="point">
        <p class="point-title">1. Формат проведения собрания:</p>
        <p>${escapeHtml(getMeetingFormLabel(meeting))}</p>
      </div>

      <div class="point">
        <p class="point-title">2. Дата и время проведения:</p>
        <p>${escapeHtml(formatMeetingDateTimeForDocument(meeting?.scheduled_at))}</p>
      </div>

      <div class="point">
        <p class="point-title">3. Место проведения:</p>
        <p>${escapeHtml(meeting?.location ?? "")}</p>
      </div>

      <div class="point">
        <p class="point-title">4. Инициатор собрания:</p>
        <p>${escapeHtml(meeting?.initiator_name ?? "")}</p>
      </div>

      <div class="point">
        <p class="point-title">5. Повестка дня:</p>
        <ol>
          ${agenda.map((item: string) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ol>
      </div>

      <div class="point">
        <p class="point-title">6. Порядок ознакомления с материалами:</p>
        <p>
          Материалы и информация по вопросам повестки дня предоставляются
          инициатором собрания для ознакомления собственникам по обращению до
          начала проведения собрания.
        </p>
        <p>С материалами можно ознакомиться по адресу:</p>
        <p>${escapeHtml(address)}, офис ОСИ.</p>
      </div>

      <div class="point">
        <p class="point-title">7. Дата размещения уведомления:</p>
        <p>${escapeHtml(formatDateOnly(meeting?.created_at))}</p>
      </div>

      <div class="point">
        <p class="point-title">8. Способ уведомления собственников:</p>
        <p>
          Уведомление размещается в общедоступных местах объекта кондоминиума,
          а также направляется собственникам посредством доступных каналов связи.
        </p>
      </div>
    </div>
  `;
}

function getPrintStyles() {
  return `
    @page {
      size: A4;
      margin: 15mm;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Times New Roman", Times, serif;
      font-size: 14pt;
      line-height: 1;
    }

    body {
      display: flex;
      justify-content: center;
    }

    #meeting-print-document {
      width: 100%;
      max-width: 180mm;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Times New Roman", Times, serif;
      font-size: 14pt;
      line-height: 1;
      text-align: justify;
      box-sizing: border-box;
    }

    h1 {
      margin: 0 0 12px 0;
      text-align: center;
      font-size: 16pt;
      font-weight: 700;
      text-transform: uppercase;
    }

    .subtitle {
      max-width: 165mm;
      margin: 0 auto 28px auto;
      text-align: center;
      font-weight: 700;
    }

    p {
      margin: 0 0 14px 0;
    }

    .point {
      margin-top: 18px;
    }

    .point-title {
      margin-bottom: 8px;
      font-weight: 700;
    }

    ol {
      margin: 0;
      padding-left: 24px;
    }

    li {
      margin-bottom: 6px;
    }

    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  `;
}

function getMeetingStatusByDate(value?: string) {
  const meetingDate = getDbDatePart(value);
  const today = getTodayDateKey();

  if (!meetingDate) return "upcoming";

  if (meetingDate < today) return "past";
  if (meetingDate === today) return "active";

  return "upcoming";
}

function getDbDatePart(value?: string) {
  if (!value) return "";
  return String(value).replace("Z", "").split("T")[0] || "";
}

function getTodayDateKey() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStatusBadgeClass(status: string) {
  const classes: Record<string, string> = {
    upcoming: "bg-blue-50 text-blue-700",
    active: "bg-green-50 text-green-700",
    past: "bg-slate-100 text-slate-600",
  };

  return classes[status] ?? "bg-slate-100 text-slate-600";
}

function translateStatus(status: string) {
  const statuses: Record<string, string> = {
    upcoming: "Предстоящий",
    active: "Активный",
    past: "Прошедший",
  };

  return statuses[status] ?? status ?? "Предстоящий";
}

function translateMeetingFormat(meeting: any) {
  return isOnlineMeeting(meeting) ? "Онлайн" : "Оффлайн";
}

function isOnlineMeeting(meeting: any) {
  const format =
    meeting?.meeting_format ||
    meeting?.meeting_form ||
    meeting?.meeting_form_label ||
    "";

  const normalized = String(format).toLowerCase();

  return (
    normalized.includes("online") ||
    normalized.includes("онлайн") ||
    normalized.includes("заоч") ||
    normalized.includes("электрон")
  );
}

function getMeetingFormLabel(meeting: any) {
  return (
    meeting?.meeting_form_label ||
    meeting?.meeting_format ||
    "Очное собрание (Явочный формат)"
  );
}

function getFormattedAddress(meeting: any) {
  const source =
    meeting?.condominium_address ||
    meeting?.building_address ||
    meeting?.address ||
    meeting?.location ||
    "";

  const parts = String(source)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 5) return source;

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

function formatMeetingDateTime(value: string) {
  if (!value) return "";

  const normalizedValue = value.replace("Z", "");
  const [datePart, timePartRaw = ""] = normalizedValue.split("T");

  if (!datePart || !timePartRaw) return value;

  const [year, month, day] = datePart.split("-");
  const timePart = timePartRaw.slice(0, 5);

  return `${day}.${month}.${year}, ${timePart}`;
}

function formatMeetingDateTimeForDocument(value: string) {
  if (!value) return "";

  const normalizedValue = value.replace("Z", "");
  const [datePart, timePartRaw = ""] = normalizedValue.split("T");

  if (!datePart || !timePartRaw) return value;

  const [year, month, day] = datePart.split("-");
  const timePart = timePartRaw.slice(0, 5);

  return `${day}.${month}.${year} в ${timePart}`;
}

function formatDateOnly(value?: string) {
  if (!value) return "";

  const normalizedValue = String(value).replace("Z", "");
  const [datePart = ""] = normalizedValue.split("T");

  if (!datePart) return value;

  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) return value;

  return `${day}.${month}.${year}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}