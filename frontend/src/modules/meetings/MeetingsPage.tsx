import { useMemo, useState } from "react";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";
import jsPDF from "jspdf";

export function MeetingsPage() {
  return (
    <Placeholder
      title="Общедомовые собрания"
      text="Выберите подпункт: инициировать, активные, предстоящие или прошедшие собрания."
    />
  );
}

export function UpcomingMeetingsPage(props: CabinetModuleProps) {
  return <MeetingsListTemplate title="Предстоящие собрания" {...props} />;
}

export function ActiveMeetingsPage(props: CabinetModuleProps) {
  return <MeetingsListTemplate title="Активные собрания" {...props} />;
}

export function PastMeetingsPage(props: CabinetModuleProps) {
  return <MeetingsListTemplate title="Прошедшие собрания" {...props} />;
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
  meetings,
  meetingError,
}: CabinetModuleProps & { title: string }) {
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);

  const sortedMeetings = useMemo(() => {
    return [...meetings].sort((a, b) => {
      const dateA = new Date(a.scheduled_at).getTime();
      const dateB = new Date(b.scheduled_at).getTime();
      return dateA - dateB;
    });
  }, [meetings]);

  const handlePrint = (meeting: any) => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Печать объявления</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              color: #0f172a;
            }
            h1 {
              text-align: center;
              font-size: 22px;
              margin-bottom: 30px;
            }
            .row {
              margin-bottom: 14px;
              font-size: 15px;
            }
            .label {
              font-weight: bold;
            }
            ul {
              margin-top: 8px;
            }
          </style>
        </head>
        <body>
          <h1>Объявление о проведении общедомового собрания</h1>

          <div class="row">
            <span class="label">Инициатор:</span> ${meeting.initiator_name}
          </div>

          <div class="row">
            <span class="label">Дата и время проведения:</span> ${formatMeetingDateTime(meeting.scheduled_at)}
          </div>

          <div class="row">
            <span class="label">Место проведения:</span> ${meeting.location}
          </div>

          <div class="row">
            <span class="label">Повестка дня:</span>
            <ul>
              ${meeting.agenda.map((item: string) => `<li>${item}</li>`).join("")}
            </ul>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Собрания отсортированы по ближайшей дате и времени.
        </p>
      </div>

      {meetingError && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
          {meetingError}
        </section>
      )}

      {sortedMeetings.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-slate-600">Данных по этому разделу пока нет.</p>
        </section>
      )}

      <div className="grid gap-5">
        {sortedMeetings.map((meeting) => (
          <section
            key={meeting.id}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    Предстоящий
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

              <div className="flex gap-2">
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
                  Скачать
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">
                Повестка:
              </p>

              <ul className="space-y-1 text-sm text-slate-600">
                {meeting.agenda.slice(0, 3).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>

              {meeting.agenda.length > 3 && (
                <p className="mt-2 text-xs text-slate-400">
                  Ещё пунктов: {meeting.agenda.length - 3}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onPrint={() => handlePrint(selectedMeeting)}
        />
      )}
    </>
  );
}

function MeetingDetailsModal({
  meeting,
  onClose,
  onPrint,
}: {
  meeting: any;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Объявление о проведении общедомового собрания
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Предпросмотр шаблона перед печатью.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 p-6">
          <p>
            <b>Инициатор:</b> {meeting.initiator_name}
          </p>

          <p>
            <b>Дата и время проведения:</b>{" "}
            {formatMeetingDateTime(meeting.scheduled_at)}
          </p>

          <p>
            <b>Место проведения:</b> {meeting.location}
          </p>

          <div>
            <p className="font-semibold">Повестка дня:</p>
            <ul className="mt-2 list-disc pl-6">
              {meeting.agenda.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-5 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={onPrint}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Печать
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMeetingDateTime(value: string) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const handleDownloadPdf = (meeting: any) => {
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Obyavlenie o provedenii obshchedomovogo sobraniya", 20, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let y = 40;

  doc.text(`Initsiator: ${meeting.initiator_name}`, 20, y);
  y += 10;

  doc.text(
    `Data i vremya: ${formatMeetingDateTime(meeting.scheduled_at)}`,
    20,
    y
  );
  y += 10;

  const locationLines = doc.splitTextToSize(
    `Mesto provedeniya: ${meeting.location}`,
    170
  );
  doc.text(locationLines, 20, y);
  y += locationLines.length * 8 + 5;

  doc.setFont("helvetica", "bold");
  doc.text("Povestka dnya:", 20, y);
  y += 10;

  doc.setFont("helvetica", "normal");

  meeting.agenda.forEach((item: string, index: number) => {
    const lines = doc.splitTextToSize(`${index + 1}. ${item}`, 170);

    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    doc.text(lines, 20, y);
    y += lines.length * 8;
  });

  doc.save(`sobranie-${meeting.id}.pdf`);
};