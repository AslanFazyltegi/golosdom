"use client";

import { useMemo, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import {
  formatAstanaDate,
  formatAstanaDateKey,
  formatAstanaDateTime,
  formatAstanaDateTimeForDocument,
  getAstanaTodayDateKey,
} from "@/shared/lib/dateTime";
import { Placeholder } from "@/shared/ui/Placeholder";
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppPageHeader,
} from "@/shared/ui/design-system";
import { MeetingConfirmationPage } from "@/modules/meetings/MeetingConfirmationPage";
import type { Meeting } from "@/types/meeting";

type MeetingsListMode = "upcoming" | "active" | "past";
type MeetingPeriodFilter = "all" | "today" | "week" | "month";
type MeetingLike = Meeting & {
  meeting_format?: string | null;
  meeting_form_label?: string | null;
  condominium_address?: string | null;
  building_address?: string | null;
  address?: string | null;
  created_at?: string | null;
};

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
      {...withoutCabinetTitle(props)}
      title="Предстоящие собрания"
      mode="upcoming"
    />
  );
}

export function ActiveMeetingsPage(props: CabinetModuleProps) {
  return (
    <MeetingsListTemplate
      {...withoutCabinetTitle(props)}
      title="Активные собрания"
      mode="active"
    />
  );
}

export function PastMeetingsPage(props: CabinetModuleProps) {
  return (
    <MeetingsListTemplate
      {...withoutCabinetTitle(props)}
      title="Прошедшие собрания"
      mode="past"
    />
  );
}

function withoutCabinetTitle(props: CabinetModuleProps) {
  const { title, ...rest } = props;
  void title;
  return rest;
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
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [search, setSearch] = useState("");
  const [formFilter, setFormFilter] = useState("all");
  const [initiatorFilter, setInitiatorFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<MeetingPeriodFilter>("all");

  const baseMeetings = useMemo(() => {
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

  const formOptions = useMemo(
    () => distinctMeetingValues(baseMeetings.map((meeting) => getMeetingFormLabel(meeting))),
    [baseMeetings],
  );
  const initiatorOptions = useMemo(
    () => distinctMeetingValues(baseMeetings.map((meeting) => meeting.initiator_name)),
    [baseMeetings],
  );
  const filtersActive =
    Boolean(search.trim()) ||
    formFilter !== "all" ||
    initiatorFilter !== "all" ||
    periodFilter !== "all";

  const visibleMeetings = useMemo(
    () =>
      baseMeetings.filter((meeting) => {
        const calculatedStatus = getMeetingStatusByDate(meeting.scheduled_at);
        const normalizedSearch = normalizeSearch(search);
        const form = getMeetingFormLabel(meeting);

        if (normalizedSearch && !buildMeetingSearchText(meeting, calculatedStatus).includes(normalizedSearch)) {
          return false;
        }
        if (formFilter !== "all" && form !== formFilter) return false;
        if (initiatorFilter !== "all" && meeting.initiator_name !== initiatorFilter) return false;
        if (periodFilter !== "all" && !matchesMeetingPeriod(meeting.scheduled_at, periodFilter, mode)) return false;

        return true;
      }),
    [baseMeetings, formFilter, initiatorFilter, mode, periodFilter, search],
  );

  function resetFilters() {
    setSearch("");
    setFormFilter("all");
    setInitiatorFilter("all");
    setPeriodFilter("all");
  }

  const handlePrint = (meeting: Meeting) => {
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

  const handleDownloadPdf = async (meeting: Meeting) => {
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
      <AppPageHeader
        title={title}
        description={
          mode === "active"
            ? "Отображаются собрания, которые состоятся сегодня."
            : "Собрания отсортированы по ближайшей дате и времени."
        }
      />

      {meetingError && (
        <section className="gd-alert gd-alert-danger mb-4">
          {meetingError}
        </section>
      )}

      <section className="gd-filter-panel">
        <div className="gd-filter-grid">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="gd-input"
            placeholder="Поиск по дате, месту, инициатору, форме, повестке или статусу"
          />
          <select
            value={formFilter}
            onChange={(event) => setFormFilter(event.target.value)}
            className="gd-input"
          >
            <option value="all">Все формы</option>
            {formOptions.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value as MeetingPeriodFilter)}
            className="gd-input"
          >
            <option value="all">Любой период</option>
            <option value="today">Сегодня</option>
            <option value="week">7 дней</option>
            <option value="month">30 дней</option>
          </select>
          <select
            value={initiatorFilter}
            onChange={(event) => setInitiatorFilter(event.target.value)}
            className="gd-input"
          >
            <option value="all">Все инициаторы</option>
            {initiatorOptions.map((initiator) => (
              <option key={initiator} value={initiator}>
                {initiator}
              </option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <div className="gd-filter-actions mt-3">
            <AppButton onClick={resetFilters}>Сбросить фильтры</AppButton>
            <span className="text-sm text-[var(--gd-muted)]">Найдено: {visibleMeetings.length}</span>
          </div>
        )}
      </section>

      {visibleMeetings.length === 0 && (
        <AppEmptyState text={filtersActive ? "Ничего не найдено." : "Данных по этому разделу пока нет."} />
      )}

      <div className="grid gap-3">
        {visibleMeetings.map((meeting) => {
          const calculatedStatus = getMeetingStatusByDate(meeting.scheduled_at);

          return (
            <section
              key={meeting.id}
              className="gd-card transition hover:border-[var(--gd-primary)] hover:shadow-md"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <AppBadge tone={getStatusBadgeTone(calculatedStatus)}>
                      {translateStatus(calculatedStatus)}
                    </AppBadge>
                    <AppBadge tone={isOnlineMeeting(meeting) ? "blue" : "slate"}>
                      {translateMeetingFormat(meeting)}
                    </AppBadge>
                    <AppBadge tone="slate">
                      {formatMeetingDateTime(meeting.scheduled_at)}
                    </AppBadge>
                  </div>

                  <h2 className="text-xl font-bold text-[var(--gd-text-strong)]">
                    Общедомовое собрание
                  </h2>

                  <p className="mt-2 text-sm text-[var(--gd-muted-strong)]">
                    <b>Инициатор:</b> {meeting.initiator_name}
                  </p>

                  <p className="mt-1 text-sm text-[var(--gd-muted-strong)]">
                    <b>Место:</b> {meeting.location}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <AppButton
                    onClick={() => setSelectedMeeting(meeting)}
                  >
                    Подробнее
                  </AppButton>

                  <AppButton
                    variant="primary"
                    onClick={() => handlePrint(meeting)}
                  >
                    Печать
                  </AppButton>

                  <AppButton
                    onClick={() => handleDownloadPdf(meeting)}
                  >
                    Скачать PDF
                  </AppButton>
                </div>
              </div>

              <div className="gd-muted-panel mt-5 p-4">
                <p className="mb-2 text-sm font-semibold text-[var(--gd-text-strong)]">
                  Повестка:
                </p>

                <ul className="space-y-1 text-sm text-[var(--gd-muted-strong)]">
                  {(meeting.agenda ?? []).slice(0, 3).map((item: string, index: number) => (
                    <li key={`${meeting.id}-agenda-${index}`}>
                      • {item}
                    </li>
                  ))}
                </ul>

                {(meeting.agenda ?? []).length > 3 && (
                  <p className="mt-2 text-xs text-[var(--gd-muted)]">
                    Ещё пунктов: {(meeting.agenda ?? []).length - 3}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selectedMeeting && (
        <div className="gd-modal-overlay">
          <div className="gd-modal-panel max-w-6xl">
            <div className="gd-modal-header">
              <h2 className="text-xl font-bold text-[var(--gd-text-strong)]">Подробнее о собрании</h2>
              <AppButton
                onClick={() => setSelectedMeeting(null)}
              >
                Закрыть
              </AppButton>
            </div>

            <div className="gd-modal-body bg-[var(--gd-surface-muted)]">
              <MeetingConfirmationPage
                meeting={selectedMeeting}
                mode="preview"
                creating={false}
                onBack={() => setSelectedMeeting(null)}
                onConfirm={() => {}}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildMeetingPrintPageHtml(meeting: MeetingLike) {
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

function buildMeetingPrintDocumentHtml(meeting: MeetingLike) {
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
        <ol class="agenda-list">
          ${agenda
            .map(
              (item: string) =>
                `<li class="agenda-list-item">${escapeHtml(item)}</li>`,
            )
            .join("")}
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
        <p>${escapeHtml(formatDateOnly(meeting.created_at || undefined))}</p>
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

    #meeting-print-document .agenda-list {
      margin: 0 0 0 24px;
      padding-left: 20px;
      list-style-type: decimal;
      list-style-position: outside;
    }

    #meeting-print-document .agenda-list-item {
      display: list-item;
      margin-bottom: 6px;
    }

    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  `;
}

function getMeetingStatusByDate(value?: string) {
  const meetingDate = formatAstanaDateKey(value);
  const today = getAstanaTodayDateKey();

  if (!meetingDate) return "upcoming";

  if (meetingDate < today) return "past";
  if (meetingDate === today) return "active";

  return "upcoming";
}

function getStatusBadgeTone(status: string): "blue" | "emerald" | "slate" {
  if (status === "active") return "emerald";
  if (status === "upcoming") return "blue";
  return "slate";
}

function translateStatus(status: string) {
  const statuses: Record<string, string> = {
    upcoming: "Предстоящий",
    active: "Активный",
    past: "Прошедший",
  };

  return statuses[status] ?? status ?? "Предстоящий";
}

function translateMeetingFormat(meeting: MeetingLike) {
  return isOnlineMeeting(meeting) ? "Онлайн" : "Оффлайн";
}

function isOnlineMeeting(meeting: MeetingLike) {
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

function getMeetingFormLabel(meeting: MeetingLike) {
  return (
    meeting?.meeting_form_label ||
    meeting?.meeting_format ||
    "Очное собрание (Явочный формат)"
  );
}

function distinctMeetingValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "ru"));
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function buildMeetingSearchText(meeting: Meeting, calculatedStatus: string) {
  return normalizeSearch(
    [
      meeting.scheduled_at ? formatMeetingDateTime(meeting.scheduled_at) : "",
      meeting.scheduled_at ? formatDateOnly(meeting.scheduled_at) : "",
      meeting.location,
      meeting.initiator_name,
      getMeetingFormLabel(meeting),
      translateMeetingFormat(meeting),
      translateStatus(calculatedStatus),
      calculatedStatus,
      ...(meeting.agenda ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function matchesMeetingPeriod(value: string, period: MeetingPeriodFilter, mode: MeetingsListMode) {
  if (period === "all") return true;

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;

  const date = new Date(time);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const meetingStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (period === "today") return meetingStart === todayStart;

  const days = period === "week" ? 7 : 30;
  if (mode === "past") {
    const rangeStart = todayStart - days * 24 * 60 * 60 * 1000;
    return meetingStart >= rangeStart && meetingStart <= todayStart;
  }

  const rangeEnd = todayStart + days * 24 * 60 * 60 * 1000;
  return meetingStart >= todayStart && meetingStart <= rangeEnd;
}

function getFormattedAddress(meeting: MeetingLike) {
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
  return formatAstanaDateTime(value);
}

function formatMeetingDateTimeForDocument(value: string) {
  return formatAstanaDateTimeForDocument(value);
}

function formatDateOnly(value?: string) {
  return formatAstanaDate(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
