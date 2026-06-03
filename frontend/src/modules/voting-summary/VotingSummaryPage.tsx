"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadVotingSummaryCSV,
  downloadVotingSummaryDetailCSV,
  fetchVotingSummary,
  fetchVotingSummaryDetail,
  openVotingSummaryReport,
  printVotingSummaryOwnerSheet,
  sendVotingSummaryReminders,
  type VotingSummaryFilters,
} from "@/lib/votings";
import { formatAstanaDateTime } from "@/shared/lib/dateTime";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import type {
  VotingCategory,
  VotingDocumentItem,
  VotingNotVotedOwner,
  VotingOwnerSummary,
  VotingProcedureCheck,
  VotingQuestionSummary,
  VotingSummaryDetail,
  VotingSummaryListItem,
  VotingSummaryMeeting,
  VotingSummaryResponse,
} from "@/types/voting";

type DetailTab =
  | "overview"
  | "questions"
  | "owners"
  | "not_voted"
  | "properties"
  | "notifications"
  | "documents"
  | "procedure"
  | "log";

const emptySummary: VotingSummaryResponse = {
  kpi: {
    total_votings: 0,
    active_votings: 0,
    completed_votings: 0,
    quorum_reached: 0,
    quorum_missing: 0,
    with_risks: 0,
  },
  meetings: [],
};

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "questions", label: "Вопросы и итоги" },
  { id: "owners", label: "Собственники" },
  { id: "not_voted", label: "Не голосовали" },
  { id: "properties", label: "Имущество" },
  { id: "notifications", label: "Уведомления" },
  { id: "documents", label: "Документы" },
  { id: "procedure", label: "Контроль процедуры" },
  { id: "log", label: "Журнал действий" },
];

export function VotingSummaryPage(props: CabinetModuleProps) {
  const canView = props.activeRole === "CHAIRMAN" || props.activeRole === "COUNCIL_MEMBER";
  const isChairman = props.activeRole === "CHAIRMAN";
  const [summary, setSummary] = useState<VotingSummaryResponse>(emptySummary);
  const [filters, setFilters] = useState<VotingSummaryFilters>({
    status: "all",
    category: "all",
    quorum: "all",
    risk: "all",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedVotingId, setSelectedVotingId] = useState("");
  const [detail, setDetail] = useState<VotingSummaryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [busyAction, setBusyAction] = useState("");

  const load = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      setError("");
      const data = await fetchVotingSummary(filters);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить свод голосований");
    } finally {
      setLoading(false);
    }
  }, [canView, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openDetail(votingId: string) {
    try {
      setSelectedVotingId(votingId);
      setDetailLoading(true);
      setError("");
      setSuccess("");
      setActiveTab("overview");
      const data = await fetchVotingSummaryDetail(votingId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть подробности");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExportSummary() {
    await runAction("summary-export", async () => {
      await downloadVotingSummaryCSV(filters);
    });
  }

  async function handleDetailExport() {
    if (!detail) return;
    await runAction("detail-export", async () => {
      await downloadVotingSummaryDetailCSV(detail.voting.id);
    });
  }

  async function handleReport() {
    if (!detail) return;
    await runAction("report", async () => {
      await openVotingSummaryReport(detail.voting.id);
    });
  }

  async function handleReminderAll() {
    if (!detail || !isChairman) return;
    await runAction("reminder-all", async () => {
      const result = await sendVotingSummaryReminders(detail.voting.id);
      setSuccess(`Отправлено напоминаний: ${result.sent}`);
      const updated = await fetchVotingSummaryDetail(detail.voting.id);
      setDetail(updated);
      await load();
    });
  }

  async function handlePrintOwner(ownerId: string) {
    if (!detail) return;
    await runAction(`print-${ownerId}`, async () => {
      await printVotingSummaryOwnerSheet(detail.voting.id, ownerId);
    });
  }

  async function runAction(name: string, action: () => Promise<void>) {
    try {
      setBusyAction(name);
      setError("");
      setSuccess("");
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    } finally {
      setBusyAction("");
    }
  }

  if (!canView) {
    return (
      <section>
        <h1 className="text-3xl font-bold text-slate-900">Свод голосований</h1>
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Нет доступа
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">Свод голосований</h1>
          <p className="mt-2 text-sm text-slate-500">
            Итоги и контроль проведения голосований по опубликованным опросным листам
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={load} loading={loading} label="Обновить" />
          <ActionButton
            onClick={handleExportSummary}
            loading={busyAction === "summary-export"}
            label="Экспорт Excel"
          />
          <button
            type="button"
            disabled
            title="Общий PDF-отчёт пока не реализован. Для выбранного опросника доступен HTML-отчёт для печати."
            className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
          >
            Сформировать общий PDF-отчёт
          </button>
        </div>
      </div>

      <KpiGrid summary={summary} />
      <Filters filters={filters} onChange={setFilters} />

      {success && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Загрузка...
        </div>
      ) : summary.meetings.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          По выбранным фильтрам опубликованных опросных листов нет.
        </div>
      ) : (
        <div className="space-y-4">
          {summary.meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              selectedVotingId={selectedVotingId}
              onOpenDetail={openDetail}
            />
          ))}
        </div>
      )}

      {detailLoading && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Загружаю подробности...
        </div>
      )}

      {detail && (
        <DetailPanel
          detail={detail}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isChairman={isChairman}
          busyAction={busyAction}
          onReminderAll={handleReminderAll}
          onExport={handleDetailExport}
          onReport={handleReport}
          onPrintOwner={handlePrintOwner}
        />
      )}
    </section>
  );
}

function KpiGrid({ summary }: { summary: VotingSummaryResponse }) {
  const cards = [
    { title: "Всего опросных листов", value: summary.kpi.total_votings, hint: "Опубликованные, завершённые, остановленные" },
    { title: "Идёт голосование", value: summary.kpi.active_votings, hint: "Сейчас доступно для голосования" },
    { title: "Завершено", value: summary.kpi.completed_votings, hint: "Завершённые и остановленные" },
    { title: "Кворум есть", value: summary.kpi.quorum_reached, hint: "По голосам имущества" },
    { title: "Кворум не достигнут", value: summary.kpi.quorum_missing, hint: "Нужно добрать голоса" },
    { title: "Есть риски", value: summary.kpi.with_risks, hint: "Сроки, ЭЦП, PDF, дубли, контакты" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">{card.title}</div>
          <div className="mt-3 text-3xl font-black text-slate-950">{card.value}</div>
          <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
        </div>
      ))}
    </div>
  );
}

function Filters({
  filters,
  onChange,
}: {
  filters: VotingSummaryFilters;
  onChange: (filters: VotingSummaryFilters) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Поиск</span>
          <input
            value={filters.search || ""}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Название, место, ФИО"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <SelectFilter
          label="Статус"
          value={filters.status || "all"}
          onChange={(status) => onChange({ ...filters, status })}
          options={[
            ["all", "Все"],
            ["active", "Идёт голосование"],
            ["completed", "Завершён"],
            ["stopped", "Остановлен"],
          ]}
        />
        <SelectFilter
          label="Категория"
          value={filters.category || "all"}
          onChange={(category) => onChange({ ...filters, category })}
          options={[
            ["all", "Все"],
            ["general", "Общий"],
            ["apartments_and_commercial", "Квартиры и НП"],
            ["parking_and_storerooms", "Кладовые и паркоместа"],
          ]}
        />
        <SelectFilter
          label="Кворум"
          value={filters.quorum || "all"}
          onChange={(quorum) => onChange({ ...filters, quorum })}
          options={[
            ["all", "Все"],
            ["has", "Есть кворум"],
            ["missing", "Нет кворума"],
            ["almost", "Почти есть"],
          ]}
        />
        <SelectFilter
          label="Риск"
          value={filters.risk || "all"}
          onChange={(risk) => onChange({ ...filters, risk })}
          options={[
            ["all", "Все"],
            ["low", "Низкий"],
            ["medium", "Средний"],
            ["high", "Высокий"],
          ]}
        />
        <DateFilter label="Дата собрания от" value={filters.meetingDateFrom} onChange={(value) => onChange({ ...filters, meetingDateFrom: value })} />
        <DateFilter label="Дата собрания до" value={filters.meetingDateTo} onChange={(value) => onChange({ ...filters, meetingDateTo: value })} />
        <DateFilter label="Публикация от" value={filters.publicationDateFrom} onChange={(value) => onChange({ ...filters, publicationDateFrom: value })} />
        <DateFilter label="Публикация до" value={filters.publicationDateTo} onChange={(value) => onChange({ ...filters, publicationDateTo: value })} />
        <DateFilter label="Завершение от" value={filters.completionDateFrom} onChange={(value) => onChange({ ...filters, completionDateFrom: value })} />
        <DateFilter label="Завершение до" value={filters.completionDateTo} onChange={(value) => onChange({ ...filters, completionDateTo: value })} />
      </div>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type="date"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function MeetingCard({
  meeting,
  selectedVotingId,
  onOpenDetail,
}: {
  meeting: VotingSummaryMeeting;
  selectedVotingId: string;
  onOpenDetail: (votingId: string) => void;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-950">
              {meeting.scheduled_at ? formatAstanaDateTime(meeting.scheduled_at) : "Дата собрания не указана"}
            </div>
            <div className="mt-1 text-sm text-slate-600">{meeting.location || "Место не указано"}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>Инициатор: {meeting.initiator || "Не указан"}</span>
              <span>Форма: {meetingFormLabel(meeting.meeting_form)}</span>
              <span>Опросных листов: {meeting.votings_count}</span>
            </div>
          </div>
          <div className="max-w-xl text-sm text-slate-600">{meeting.agenda?.slice(0, 3).join("; ") || "Повестка не указана"}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Опросный лист</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Сроки</th>
              <th className="px-4 py-3">Проголосовали</th>
              <th className="px-4 py-3">Кворум</th>
              <th className="px-4 py-3">Решения</th>
              <th className="px-4 py-3">Риск</th>
              <th className="px-4 py-3">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meeting.votings.map((voting) => (
              <VotingRow
                key={voting.id}
                voting={voting}
                selected={selectedVotingId === voting.id}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function VotingRow({
  voting,
  selected,
  onOpenDetail,
}: {
  voting: VotingSummaryListItem;
  selected: boolean;
  onOpenDetail: (votingId: string) => void;
}) {
  return (
    <tr className={selected ? "bg-blue-50/70" : "bg-white"}>
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-950">{voting.title}</div>
        <div className="mt-1 text-xs text-slate-500">
          Версия {voting.version} · вопросов: {voting.questions_count}
        </div>
      </td>
      <td className="px-4 py-3">{categoryLabel(voting.category)}</td>
      <td className="px-4 py-3">
        <StatusBadge label={voting.status_label} color={statusColor(voting.status)} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        <div>Публикация: {formatDateTimeOrDash(voting.publication_start_at)}</div>
        <div>Крайний срок: {formatDateTimeOrDash(voting.publication_end_at)}</div>
        {voting.completed_at && <div>Факт: {formatDateTimeOrDash(voting.completed_at)}</div>}
        {voting.stopped_at && <div>Остановлен: {formatDateTimeOrDash(voting.stopped_at)}</div>}
      </td>
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-900">
          {voting.voted_owners_count} собств. / {voting.voted_property_votes} голосов
        </div>
        <div className="mt-1 text-xs text-slate-500">
          из {voting.total_property_votes} голосов · {voting.participation_percent.toFixed(2)}%
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge label={voting.has_quorum ? "Есть" : "Нет"} color={voting.has_quorum ? "emerald" : "amber"} />
        {!voting.has_quorum && (
          <div className="mt-1 text-xs text-slate-500">Не хватает: {voting.quorum_missing_votes}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {voting.accepted_questions} из {voting.total_questions} вопросов принято
      </td>
      <td className="px-4 py-3">
        <StatusBadge label={riskLabel(voting.risk_level)} color={riskColor(voting.risk_level)} />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenDetail(voting.id)}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          Подробнее
        </button>
      </td>
    </tr>
  );
}

function DetailPanel({
  detail,
  activeTab,
  setActiveTab,
  isChairman,
  busyAction,
  onReminderAll,
  onExport,
  onReport,
  onPrintOwner,
}: {
  detail: VotingSummaryDetail;
  activeTab: DetailTab;
  setActiveTab: (tab: DetailTab) => void;
  isChairman: boolean;
  busyAction: string;
  onReminderAll: () => void;
  onExport: () => void;
  onReport: () => void;
  onPrintOwner: (ownerId: string) => void;
}) {
  const canSendReminder = isChairman && detail.voting.status === "active";

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black text-slate-950">{detail.voting.title}</h2>
              <StatusBadge label={categoryLabel(detail.voting.category)} color="slate" />
              <StatusBadge label={detail.voting.status_label} color={statusColor(detail.voting.status)} />
            </div>
            <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
              <span>Собрание: {detail.voting.meeting_location || "Не указано"}</span>
              <span>Дата: {formatDateTimeOrDash(detail.voting.meeting_scheduled_at)}</span>
              <span>Публикация: {formatDateTimeOrDash(detail.voting.publication_start_at)}</span>
              <span>Крайний срок: {formatDateTimeOrDash(detail.voting.publication_end_at)}</span>
              <span>Вопросов: {detail.voting.questions_count}</span>
              <span>
                Проголосовали: {detail.voting.voted_owners_count} собственников / {detail.voting.voted_property_votes} голосов
              </span>
              <span>Не голосовали: {detail.voting.not_voted_owners_count} собственников</span>
              <span>Кворум: {detail.voting.has_quorum ? "есть" : `нет, не хватает ${detail.voting.quorum_missing_votes}`}</span>
              {typeof detail.voting.days_left === "number" && <span>Осталось дней: {detail.voting.days_left}</span>}
              <span>
                Итог: {detail.voting.accepted_questions} принято / {detail.voting.rejected_questions} не принято
              </span>
            </div>
          </div>
          <div className="flex max-w-xl flex-wrap gap-2">
            {isChairman && (
              <button
                type="button"
                onClick={onReminderAll}
                disabled={!canSendReminder || busyAction === "reminder-all"}
                title={canSendReminder ? "" : "Напоминания доступны только при идущем голосовании"}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                Отправить напоминание
              </button>
            )}
            <ActionButton onClick={onExport} loading={busyAction === "detail-export"} label="Экспорт Excel" />
            <button
              type="button"
              disabled
              title="PDF-генерация не реализована. Доступен HTML-отчёт для печати."
              className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
            >
              Сформировать PDF-отчёт
            </button>
            {isChairman && (
              <button
                type="button"
                disabled
                title="ZIP-архив не реализован в текущей версии"
                className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
              >
                Сформировать архивный пакет
              </button>
            )}
            <ActionButton onClick={onReport} loading={busyAction === "report"} label={isChairman ? "Печать" : "Скачать отчёт"} />
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-5 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {activeTab === "overview" && <OverviewTab detail={detail} />}
        {activeTab === "questions" && <QuestionsTab questions={detail.questions} />}
        {activeTab === "owners" && (
          <OwnersTab owners={detail.owners} busyAction={busyAction} onPrintOwner={onPrintOwner} />
        )}
        {activeTab === "not_voted" && (
          <NotVotedTab detail={detail} isChairman={isChairman} busyAction={busyAction} />
        )}
        {activeTab === "properties" && <PropertiesTab detail={detail} />}
        {activeTab === "notifications" && <NotificationsTab detail={detail} />}
        {activeTab === "documents" && <DocumentsTab detail={detail} onExport={onExport} onReport={onReport} />}
        {activeTab === "procedure" && <ProcedureTab checks={detail.procedure.checks} status={detail.procedure.status} />}
        {activeTab === "log" && <LogTab detail={detail} />}
      </div>
    </section>
  );
}

function OverviewTab({ detail }: { detail: VotingSummaryDetail }) {
  const metrics = [
    detail.overview.participation,
    detail.overview.quorum,
    detail.overview.timeline,
    detail.overview.decisions,
    detail.overview.documents,
    detail.overview.problems,
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex justify-between text-sm font-semibold text-slate-700">
          <span>Шкала кворума</span>
          <span>
            {detail.voting.voted_property_votes} / {detail.voting.total_property_votes}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${detail.voting.has_quorum ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${Math.min(100, detail.voting.participation_percent)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Требуется для кворума: {detail.voting.quorum_required_votes} голосов по имуществу
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.title} className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">{metric.title}</div>
            <div className="mt-2 text-xl font-black text-slate-950">{metric.value}</div>
            <div className="mt-1 text-sm text-slate-500">{metric.hint}</div>
          </div>
        ))}
      </div>

      {(detail.voting.risk_reasons.length > 0 || detail.voting.warnings.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-bold text-amber-900">Проблемные места</div>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {[...detail.voting.risk_reasons, ...detail.voting.warnings].map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuestionsTab({ questions }: { questions: VotingQuestionSummary[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[940px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">№</th>
            <th className="px-4 py-3">Текст вопроса</th>
            <th className="px-4 py-3">За</th>
            <th className="px-4 py-3">Против</th>
            <th className="px-4 py-3">Воздержались</th>
            <th className="px-4 py-3">Не голосовали</th>
            <th className="px-4 py-3">% За</th>
            <th className="px-4 py-3">Итог</th>
            <th className="px-4 py-3">Детализация</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {questions.map((question) => (
            <Fragment key={question.id}>
              <tr>
                <td className="px-4 py-3">{question.number}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{question.text}</td>
                <td className="px-4 py-3">{question.for_votes}</td>
                <td className="px-4 py-3">{question.against_votes}</td>
                <td className="px-4 py-3">{question.abstain_votes}</td>
                <td className="px-4 py-3">{question.not_voted_votes}</td>
                <td className="px-4 py-3">{question.for_percent.toFixed(2)}%</td>
                <td className="px-4 py-3">
                  <StatusBadge label={questionResultLabel(question.result)} color={questionResultColor(question.result)} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [question.id]: !current[question.id] }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {expanded[question.id] ? "Скрыть" : "Показать детализацию"}
                  </button>
                </td>
              </tr>
              {expanded[question.id] && (
                <tr>
                  <td colSpan={9} className="bg-slate-50 px-4 py-4">
                    <QuestionDetails question={question} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionDetails({ question }: { question: VotingQuestionSummary }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <AnswerGroup title="За" items={question.details.for} />
      <AnswerGroup title="Против" items={question.details.against} />
      <AnswerGroup title="Воздержусь" items={question.details.abstain} />
    </div>
  );
}

function AnswerGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ owner_id: string; owner_name: string; property_votes: number; properties: string[] }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-bold text-slate-900">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-slate-500">Нет голосов</div>
      ) : (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item.owner_id}>
              <div className="font-semibold">{item.owner_name}</div>
              <div className="text-xs text-slate-500">
                {item.property_votes} голосов · {item.properties.join(", ")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnersTab({
  owners,
  busyAction,
  onPrintOwner,
}: {
  owners: VotingOwnerSummary[];
  busyAction: string;
  onPrintOwner: (ownerId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1180px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">ФИО собственника</th>
            <th className="px-4 py-3">Объект имущества</th>
            <th className="px-4 py-3">Тип имущества</th>
            <th className="px-4 py-3">Лицевой счёт</th>
            <th className="px-4 py-3">Голосов по имуществу</th>
            <th className="px-4 py-3">Статус</th>
            <th className="px-4 py-3">Дата голосования</th>
            <th className="px-4 py-3">Способ</th>
            <th className="px-4 py-3">ЭЦП</th>
            <th className="px-4 py-3">PDF</th>
            <th className="px-4 py-3">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {owners.map((owner) => (
            <tr key={owner.owner_id}>
              <td className="px-4 py-3">
                <div className="font-semibold text-slate-950">{owner.owner_name}</div>
                <div className="text-xs text-slate-500">{owner.phone || owner.email || "Контакты не указаны"}</div>
              </td>
              <td className="px-4 py-3">{owner.property_label || "Не указано"}</td>
              <td className="px-4 py-3">{owner.property_types || "Не указано"}</td>
              <td className="px-4 py-3">{owner.erc_accounts || "Не указан"}</td>
              <td className="px-4 py-3 font-semibold">{owner.property_votes}</td>
              <td className="px-4 py-3">
                <StatusBadge label={owner.status === "voted" ? "Проголосовал" : "Не голосовал"} color={owner.status === "voted" ? "emerald" : "slate"} />
              </td>
              <td className="px-4 py-3">{formatDateTimeOrDash(owner.voted_at)}</td>
              <td className="px-4 py-3">{methodLabel(owner.method)}</td>
              <td className="px-4 py-3">{signatureLabel(owner.signature.status)}</td>
              <td className="px-4 py-3">{owner.pdf_status === "formed" ? "Сформирован" : "Не сформирован"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={owner.status !== "voted"}
                    onClick={() => onPrintOwner(owner.owner_id)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {busyAction === `print-${owner.owner_id}` ? "Открываю..." : "Распечатать"}
                  </button>
                  <button
                    type="button"
                    disabled
                    title="PDF-файл собственника пока не сформирован"
                    className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400"
                  >
                    Скачать PDF
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotVotedTab({
  detail,
  isChairman,
  busyAction,
}: {
  detail: VotingSummaryDetail;
  isChairman: boolean;
  busyAction: string;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id),
    [selected],
  );
  const canSend = isChairman && detail.voting.status === "active";

  async function sendSelected() {
    try {
      setError("");
      setMessage("");
      const result = await sendVotingSummaryReminders(detail.voting.id, selectedIds);
      setMessage(`Отправлено напоминаний: ${result.sent}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить напоминания");
    }
  }

  return (
    <div className="space-y-3">
      {isChairman && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSend || selectedIds.length === 0}
            onClick={sendSelected}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Отправить выбранным
          </button>
          <button
            type="button"
            disabled
            title="Список обзвона выгружается через Excel/CSV"
            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
          >
            Добавить в список обзвона
          </button>
          <button
            type="button"
            disabled
            title="Используйте экспорт Excel по опроснику"
            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
          >
            Экспорт списка для обзвона
          </button>
        </div>
      )}
      {message && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {isChairman && <th className="px-4 py-3">Выбор</th>}
              <th className="px-4 py-3">ФИО</th>
              <th className="px-4 py-3">Объект</th>
              <th className="px-4 py-3">Тип имущества</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Уведомление</th>
              <th className="px-4 py-3">Последнее напоминание</th>
              <th className="px-4 py-3">Голосов</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.not_voted.map((owner: VotingNotVotedOwner) => (
              <tr key={owner.owner_id}>
                {isChairman && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[owner.owner_id])}
                      onChange={(event) => setSelected((current) => ({ ...current, [owner.owner_id]: event.target.checked }))}
                      disabled={!canSend || busyAction !== ""}
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-semibold text-slate-950">{owner.owner_name}</td>
                <td className="px-4 py-3">{owner.property_label || "Не указано"}</td>
                <td className="px-4 py-3">{owner.property_types || "Не указано"}</td>
                <td className="px-4 py-3">{owner.phone || "Не указан"}</td>
                <td className="px-4 py-3">{owner.email || "Не указан"}</td>
                <td className="px-4 py-3">{notificationStatusLabel(owner.notification_status)}</td>
                <td className="px-4 py-3">{formatDateTimeOrDash(owner.last_reminder_at)}</td>
                <td className="px-4 py-3 font-semibold">{owner.property_votes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PropertiesTab({ detail }: { detail: VotingSummaryDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Тип имущества</th>
            <th className="px-4 py-3">Всего объектов в МЖК</th>
            <th className="px-4 py-3">Имеют право голосовать</th>
            <th className="px-4 py-3">Проголосовали объектами</th>
            <th className="px-4 py-3">Не голосовали объектами</th>
            <th className="px-4 py-3">Участие</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {detail.properties.map((item) => (
            <tr key={item.type}>
              <td className="px-4 py-3 font-semibold">{item.type_label}</td>
              <td className="px-4 py-3">{item.total_objects}</td>
              <td className="px-4 py-3">{item.eligible_objects}</td>
              <td className="px-4 py-3">{item.voted_objects}</td>
              <td className="px-4 py-3">{item.not_voted_objects}</td>
              <td className="px-4 py-3">{item.participation_percent.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotificationsTab({ detail }: { detail: VotingSummaryDetail }) {
  const cards = [
    ["Отправлено", detail.notifications.sent],
    ["Доставлено", detail.notifications.delivered],
    ["Прочитано", detail.notifications.read],
    ["Не доставлено", detail.notifications.failed],
    ["Нет контактов", detail.notifications.no_contacts],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        {cards.map(([title, value]) => (
          <div key={title} className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">{title}</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Тип события</th>
              <th className="px-4 py-3">Получателей</th>
              <th className="px-4 py-3">Доставлено</th>
              <th className="px-4 py-3">Прочитано</th>
              <th className="px-4 py-3">Ошибка доставки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.notifications.events.map((event) => (
              <tr key={`${event.type}-${event.date || ""}`}>
                <td className="px-4 py-3">{formatDateTimeOrDash(event.date)}</td>
                <td className="px-4 py-3">{notificationEventLabel(event.type)}</td>
                <td className="px-4 py-3">{event.recipients}</td>
                <td className="px-4 py-3">{event.delivered}</td>
                <td className="px-4 py-3">{event.read}</td>
                <td className="px-4 py-3">{event.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentsTab({
  detail,
  onExport,
  onReport,
}: {
  detail: VotingSummaryDetail;
  onExport: () => void;
  onReport: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title="PDF-генерация не реализована. Доступен HTML print view."
          className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
        >
          Сформировать итоговый PDF
        </button>
        <ActionButton onClick={onExport} label="Скачать Excel" />
        <button
          type="button"
          disabled
          title="ZIP-архив не реализован в текущей версии"
          className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
        >
          Скачать архив
        </button>
        <ActionButton onClick={onReport} label="Печать" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {detail.documents.items.map((item: VotingDocumentItem) => (
          <div key={item.code} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-500">{item.description}</div>
              </div>
              <StatusBadge label={documentStatusLabel(item.status)} color={item.available ? "emerald" : "slate"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcedureTab({ checks, status }: { checks: VotingProcedureCheck[]; status: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800">
        {status}
      </div>
      <div className="grid gap-2">
        {checks.map((check) => (
          <div key={check.code} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div>
              <div className="font-semibold text-slate-900">{check.title}</div>
              {check.comment && <div className="mt-1 text-sm text-slate-500">{check.comment}</div>}
            </div>
            <StatusBadge label={check.status === "ok" ? "OK" : "Требует проверки"} color={check.status === "ok" ? "emerald" : "amber"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LogTab({ detail }: { detail: VotingSummaryDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[780px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Дата и время</th>
            <th className="px-4 py-3">Действие</th>
            <th className="px-4 py-3">Кто сделал</th>
            <th className="px-4 py-3">Роль</th>
            <th className="px-4 py-3">Детали</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {detail.action_log.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-3">{formatDateTimeOrDash(item.created_at)}</td>
              <td className="px-4 py-3">{actionLabel(item.action)}</td>
              <td className="px-4 py-3">{item.actor_name || "Система"}</td>
              <td className="px-4 py-3">{roleLabel(item.actor_role)}</td>
              <td className="px-4 py-3">{item.details || "Не указано"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  loading,
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Выполняется..." : label}
    </button>
  );
}

function StatusBadge({
  label,
  color,
}: {
  label: string;
  color: "blue" | "emerald" | "amber" | "red" | "slate";
}) {
  const classes: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${classes[color]}`}>
      {label}
    </span>
  );
}

function categoryLabel(category: VotingCategory | string) {
  const labels: Record<string, string> = {
    general: "Общий",
    apartments_and_commercial: "Квартиры и НП",
    parking_and_storerooms: "Кладовые и паркоместа",
  };
  return labels[category] || "Общий";
}

function statusColor(status: string): "blue" | "emerald" | "amber" | "slate" {
  if (status === "active") return "blue";
  if (status === "completed") return "emerald";
  if (status === "stopped") return "amber";
  return "slate";
}

function riskLabel(risk: string) {
  if (risk === "high") return "Высокий";
  if (risk === "medium") return "Средний";
  return "Низкий";
}

function riskColor(risk: string): "emerald" | "amber" | "red" {
  if (risk === "high") return "red";
  if (risk === "medium") return "amber";
  return "emerald";
}

function questionResultLabel(result: string) {
  const labels: Record<string, string> = {
    accepted: "Решение принято",
    rejected: "Решение не принято",
    not_enough_votes: "Недостаточно голосов",
    needs_review: "Требует проверки",
  };
  return labels[result] || "Требует проверки";
}

function questionResultColor(result: string): "emerald" | "amber" | "red" | "slate" {
  if (result === "accepted") return "emerald";
  if (result === "not_enough_votes") return "amber";
  if (result === "rejected") return "red";
  return "slate";
}

function meetingFormLabel(value: string) {
  if (value === "online") return "Онлайн";
  if (value === "mixed") return "Смешанная";
  return "Очно";
}

function methodLabel(value: string) {
  if (value === "MOCK_MGOV") return "Онлайн, mGov";
  if (value === "MOCK_ECP") return "Онлайн, ЭЦП";
  return value || "Онлайн";
}

function signatureLabel(value: string) {
  if (value === "signed") return "Проверена";
  if (value === "error") return "Ошибка";
  if (value === "not_required") return "Не требуется";
  return "Нет";
}

function notificationStatusLabel(value: string) {
  const labels: Record<string, string> = {
    sent: "отправлено",
    delivered: "доставлено",
    read: "прочитано",
    failed: "не доставлено",
    no_contacts: "нет контактов",
    not_sent: "не отправлено",
  };
  return labels[value] || value || "не отправлено";
}

function notificationEventLabel(value: string) {
  const labels: Record<string, string> = {
    publication: "публикация голосования",
    first_notification: "первое уведомление",
    reminder: "напоминание",
    repeat_reminder: "повторное напоминание",
  };
  return labels[value] || value;
}

function documentStatusLabel(value: string) {
  const labels: Record<string, string> = {
    available: "Доступен",
    not_formed: "Не сформирован",
    not_implemented: "Недоступен",
  };
  return labels[value] || value;
}

function actionLabel(value: string) {
  const labels: Record<string, string> = {
    created: "опросник создан",
    submitted_to_council: "отправлен на утверждение",
    approved: "утверждён советом",
    published: "опубликован",
    notification_created: "уведомление создано",
    owner_voted: "собственник проголосовал",
    signature_checked: "ЭЦП проверена",
    pdf_formed: "PDF сформирован",
    reminder_sent: "напоминание отправлено",
    completed: "голосование завершено",
    stopped: "голосование остановлено",
    report_formed: "отчёт сформирован",
  };
  return labels[value] || value;
}

function roleLabel(value: string) {
  const labels: Record<string, string> = {
    CHAIRMAN: "Председатель",
    COUNCIL_MEMBER: "Член совета дома",
    OWNER: "Собственник",
  };
  return labels[value] || value || "Система";
}

function formatDateTimeOrDash(value?: string | null) {
  return value ? formatAstanaDateTime(value) : "Не указано";
}
