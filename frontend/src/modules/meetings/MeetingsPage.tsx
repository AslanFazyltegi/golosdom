import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

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
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{title}</h1>

      {meetingError && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
          {meetingError}
        </section>
      )}

      {meetings.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-slate-600">Данных по этому разделу пока нет.</p>
        </section>
      )}

      <div className="space-y-4">
        {meetings.map((meeting) => (
          <section
            key={meeting.id}
            className="rounded-2xl border bg-white p-6 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {meeting.initiator_name}
              </h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                {meeting.status}
              </span>
            </div>

            <p className="text-slate-600">
              <b>Дата:</b>{" "}
              {new Date(meeting.scheduled_at).toLocaleString("ru-RU")}
            </p>
            <p className="mt-1 text-slate-600">
              <b>Место:</b> {meeting.location}
            </p>

            <div className="mt-4">
              <p className="font-medium">Повестка:</p>
              <ul className="mt-2 list-disc pl-5 text-slate-600">
                {meeting.agenda.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
