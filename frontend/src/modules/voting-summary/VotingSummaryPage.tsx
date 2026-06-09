"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type SelectedVotingSummary = {
  meeting: VotingSummaryMeeting;
  voting: VotingSummaryListItem;
};

const defaultFilters: VotingSummaryFilters = {
  status: "all",
  category: "all",
  quorum: "all",
  risk: "all",
};

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
  const [filters, setFilters] = useState<VotingSummaryFilters>(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedVotingSummary, setSelectedVotingSummary] = useState<SelectedVotingSummary | null>(null);
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

  async function openDetail(selection: SelectedVotingSummary) {
    try {
      setSelectedVotingSummary(selection);
      setDetail(null);
      setDetailLoading(true);
      setError("");
      setSuccess("");
      setActiveTab("overview");
      const data = await fetchVotingSummaryDetail(selection.voting.id);
      setDetail(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть подробности");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setDetailLoading(false);
    setSelectedVotingSummary(null);
    setActiveTab("overview");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  async function handleReminderOwner(ownerId: string) {
    if (!detail || !isChairman) return;
    await runAction(`reminder-${ownerId}`, async () => {
      const result = await sendVotingSummaryReminders(detail.voting.id, [ownerId]);
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
      <section className="gd-voting-summary space-y-5 bg-slate-50">
        <div className="text-sm font-semibold text-slate-500">
          Кабинет <span className="mx-1">›</span> Голосование <span className="mx-1">›</span> Свод голосований
        </div>
        <h1 className="text-3xl font-black text-slate-950">Свод голосований</h1>
        <div className="rounded-[22px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Нет доступа
        </div>
      </section>
    );
  }

  if (detail || detailLoading) {
    return (
      <section className="gd-voting-summary space-y-4 bg-slate-50">
        {success && <Notice tone="success" text={success} />}
        {error && <Notice tone="error" text={error} />}
        {detailLoading && !detail ? (
          <DetailLoading onBack={closeDetail} />
        ) : (
          detail && (
            <DetailView
              detail={detail}
              selectedVotingSummary={selectedVotingSummary}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isChairman={isChairman}
              busyAction={busyAction}
              onBack={closeDetail}
              onReminderAll={handleReminderAll}
              onReminderOwner={handleReminderOwner}
              onExport={handleDetailExport}
              onReport={handleReport}
              onPrintOwner={handlePrintOwner}
            />
          )
        )}
      </section>
    );
  }

  return (
    <section className="gd-voting-summary space-y-4 bg-slate-50">
      <PageHeader
        loading={loading}
        busyAction={busyAction}
        onRefresh={load}
        onExport={handleExportSummary}
      />

      <KpiGrid summary={summary} />
      <Filters filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters)} />

      {success && <Notice tone="success" text={success} />}
      {error && <Notice tone="error" text={error} />}

      {loading ? (
        <EmptyCard text="Загрузка..." />
      ) : summary.meetings.length === 0 ? (
        <EmptyCard text="По выбранным фильтрам опубликованных опросных листов нет." />
      ) : (
        <div className="space-y-4">
          {summary.meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} onOpenDetail={openDetail} />
          ))}
        </div>
      )}
    </section>
  );
}

function PageHeader({
  loading,
  busyAction,
  onRefresh,
  onExport,
}: {
  loading: boolean;
  busyAction: string;
  onRefresh: () => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-500">
        Кабинет <span className="mx-1">›</span> Голосование <span className="mx-1">›</span>{" "}
        <span className="font-bold text-slate-800">Свод голосований</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-black leading-tight text-slate-950">Свод голосований</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            Правильная структура: сначала собрание, внутри него опубликованные опросные листы, а уже внутри каждого
            ОП — вопросы, собственники, документы и контроль процедуры.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={onRefresh} loading={loading} label="Обновить" variant="ghost" />
          <ActionButton onClick={onExport} loading={busyAction === "summary-export"} label="Excel" />
          <ActionButton
            label="PDF-свод"
            disabled
            title="Общий PDF-свод пока не реализован. Для выбранного ОП доступен HTML PDF-отчёт/печать."
          />
        </div>
      </div>
    </div>
  );
}

function KpiGrid({ summary }: { summary: VotingSummaryResponse }) {
  const votings = allVotings(summary);
  const almostQuorum = votings.filter((voting) => !voting.has_quorum && voting.quorum_missing_votes > 0 && voting.quorum_missing_votes <= 25);
  const highRisk = votings.filter((voting) => voting.risk_level === "high").length;
  const signedOwners = votings.reduce((sum, voting) => sum + (voting.signed_owners_count || 0), 0);
  const maxAlmostMissing = almostQuorum.reduce((max, voting) => Math.max(max, voting.quorum_missing_votes), 0);

  const cards = [
    {
      title: "Опубликованные ОП",
      value: summary.kpi.total_votings,
      hint: `по ${summary.meetings.length} собраниям`,
      tone: "default" as const,
    },
    {
      title: "Идёт голосование",
      value: summary.kpi.active_votings,
      hint: "можно отправлять напоминания",
      tone: "default" as const,
    },
    {
      title: "С кворумом",
      value: summary.kpi.quorum_reached,
      hint: "кворум достигнут",
      tone: "good" as const,
    },
    {
      title: "Почти кворум",
      value: almostQuorum.length,
      hint: maxAlmostMissing > 0 ? `не хватает до ${maxAlmostMissing} голосов` : "нет близких к кворуму",
      tone: "warn" as const,
    },
    {
      title: "Высокий риск",
      value: highRisk,
      hint: "требует проверки",
      tone: "bad" as const,
    },
    {
      title: "Подписанные ОП",
      value: signedOwners,
      hint: "PDF + ЭЦП",
      tone: "default" as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: number | string;
  hint: string;
  tone: "default" | "good" | "warn" | "bad";
}) {
  const valueColor = {
    default: "text-slate-950",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className={`mt-2 text-3xl font-black ${valueColor}`}>{value}</div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Filters({
  filters,
  onChange,
  onReset,
}: {
  filters: VotingSummaryFilters;
  onChange: (filters: VotingSummaryFilters) => void;
  onReset: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="grid min-w-[1120px] grid-cols-[1.4fr_repeat(5,minmax(132px,1fr))_auto] items-end gap-3">
        <label className="space-y-1.5">
          <span className="text-xs font-extrabold text-slate-500">Поиск</span>
          <input
            value={filters.search || ""}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Собрание, ОП, адрес, вопрос..."
            className="h-11 w-full rounded-[13px] border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <SelectFilter
          label="Статус"
          value={filters.status || "all"}
          onChange={(status) => onChange({ ...filters, status })}
          options={[
            ["all", "Все"],
            ["active", "Идёт"],
            ["completed", "Завершён"],
            ["stopped", "Остановлен"],
          ]}
        />
        <SelectFilter
          label="Категория ОП"
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
            ["has", "Есть"],
            ["missing", "Нет"],
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
        <label className="space-y-1.5">
          <span className="text-xs font-extrabold text-slate-500">Дата собрания</span>
          <input
            type="date"
            value={filters.meetingDateFrom || ""}
            onChange={(event) => onChange({ ...filters, meetingDateFrom: event.target.value, meetingDateTo: event.target.value })}
            className="h-11 w-full rounded-[13px] border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <button
          type="button"
          onClick={onReset}
          className="h-11 rounded-[13px] border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          Сбросить
        </button>
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
    <label className="space-y-1.5">
      <span className="text-xs font-extrabold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[13px] border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
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

function MeetingCard({
  meeting,
  onOpenDetail,
}: {
  meeting: VotingSummaryMeeting;
  onOpenDetail: (selection: SelectedVotingSummary) => void;
}) {
  const activeCount = meeting.votings.filter((voting) => voting.status === "active").length;
  const quorumCount = meeting.votings.filter((voting) => voting.has_quorum).length;

  return (
    <article className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-lg font-black text-blue-600">
            К
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-950">Собрание от {formatDateOnly(meeting.scheduled_at)}</h2>
            <div className="mt-1 text-sm text-slate-500">{meeting.location || "Место не указано"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge label={meetingFormLabel(meeting.meeting_form)} color="blue" />
              <StatusBadge label={`Инициатор: ${meeting.initiator || "Не указан"}`} color="slate" />
              <StatusBadge label={`ОП: ${meeting.votings_count}`} color="slate" />
              <StatusBadge label={`С кворумом: ${quorumCount}`} color="emerald" />
              {activeCount > 0 && <StatusBadge label={`Идёт: ${activeCount}`} color="amber" />}
            </div>
          </div>
        </div>
        <div className="max-w-xl text-sm leading-6 text-slate-500">
          {meeting.agenda?.slice(0, 3).join("; ") || "Повестка не указана"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <th className="px-4 py-3">Опросный лист</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Сроки</th>
              <th className="px-4 py-3">Прогресс</th>
              <th className="px-4 py-3">Кворум</th>
              <th className="px-4 py-3">Решения</th>
              <th className="px-4 py-3">Риск</th>
              <th className="px-4 py-3">ЭЦП/PDF</th>
              <th className="px-4 py-3">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meeting.votings.map((voting) => (
              <VotingRow key={voting.id} meeting={meeting} voting={voting} onOpenDetail={onOpenDetail} />
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function VotingRow({
  meeting,
  voting,
  onOpenDetail,
}: {
  meeting: VotingSummaryMeeting;
  voting: VotingSummaryListItem;
  onOpenDetail: (selection: SelectedVotingSummary) => void;
}) {
  const signed = voting.signed_owners_count || 0;
  const pdfFormed = voting.pdf_formed_owners_count || 0;
  const votedOwners = voting.voted_owners_count || 0;

  return (
    <tr className="bg-white hover:bg-slate-50">
      <td className="px-4 py-4 align-middle">
        <div className="font-black text-slate-950">{voting.title}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge label={categoryLabel(voting.category)} color={categoryColor(voting.category)} />
          <StatusBadge label="Формат по ответам" color="slate" />
        </div>
      </td>
      <td className="px-4 py-4 align-middle">
        <div className={`font-black ${statusTextClass(voting.status)}`}>{voting.status_label}</div>
        {(voting.completed_at || voting.stopped_at) && (
          <div className="mt-1 text-xs text-slate-500">
            Факт: {formatDateTimeOrDash(voting.completed_at || voting.stopped_at)}
          </div>
        )}
      </td>
      <td className="px-4 py-4 align-middle text-xs leading-5 text-slate-600">
        <div>Старт: {formatDateTimeOrDash(voting.publication_start_at)}</div>
        <div>Крайний срок: {formatDateTimeOrDash(voting.publication_end_at)}</div>
      </td>
      <td className="px-4 py-4 align-middle">
        <div className="flex items-center gap-2">
          <b className="text-slate-950">
            {voting.voted_property_votes}/{voting.total_property_votes}
          </b>
          <span className="text-xs text-slate-500">{formatPercent(voting.participation_percent)}</span>
        </div>
        <ProgressBar value={voting.participation_percent} tone={voting.has_quorum ? "good" : voting.quorum_missing_votes <= 25 ? "warn" : "bad"} />
        <div className="mt-1 text-xs text-slate-500">
          {voting.voted_owners_count} собственников / {voting.voted_property_votes} голосов
        </div>
      </td>
      <td className="px-4 py-4 align-middle">
        <QuorumBadge voting={voting} />
      </td>
      <td className="px-4 py-4 align-middle">
        <b className="text-slate-950">
          {voting.accepted_questions} из {voting.total_questions} проходят
        </b>
        <div className="mt-1 text-xs text-slate-500">по вопросам внутри ОП</div>
      </td>
      <td className="px-4 py-4 align-middle">
        <StatusBadge label={riskLabel(voting.risk_level)} color={riskColor(voting.risk_level)} />
        {voting.risk_reasons.length > 0 && (
          <div className="mt-1 text-xs text-slate-500">Проблемы: {voting.risk_reasons.length}</div>
        )}
      </td>
      <td className="px-4 py-4 align-middle">
        <b className="text-slate-950">
          {signed}/{votedOwners}
        </b>{" "}
        ЭЦП
        <div className="mt-1 text-xs text-slate-500">
          PDF: {pdfFormed}/{votedOwners}
        </div>
      </td>
      <td className="px-4 py-4 align-middle">
        <button
          type="button"
          onClick={() => onOpenDetail({ meeting, voting })}
          className="rounded-[10px] border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          Подробнее
        </button>
      </td>
    </tr>
  );
}

function DetailLoading({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-4">
        <ActionButton label="← Назад" onClick={onBack} />
      </div>
      <div className="text-sm text-slate-500">Загружаю подробности...</div>
    </div>
  );
}

function DetailView({
  detail,
  selectedVotingSummary,
  activeTab,
  setActiveTab,
  isChairman,
  busyAction,
  onBack,
  onReminderAll,
  onReminderOwner,
  onExport,
  onReport,
  onPrintOwner,
}: {
  detail: VotingSummaryDetail;
  selectedVotingSummary: SelectedVotingSummary | null;
  activeTab: DetailTab;
  setActiveTab: (tab: DetailTab) => void;
  isChairman: boolean;
  busyAction: string;
  onBack: () => void;
  onReminderAll: () => void;
  onReminderOwner: (ownerId: string) => void;
  onExport: () => void;
  onReport: () => void;
  onPrintOwner: (ownerId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <DetailHeader
        detail={detail}
        selectedVotingSummary={selectedVotingSummary}
        isChairman={isChairman}
        busyAction={busyAction}
        onBack={onBack}
        onReminderAll={onReminderAll}
        onExport={onExport}
        onReport={onReport}
        onPrintOwner={onPrintOwner}
      />

      <div className="sticky top-0 z-10 overflow-x-auto rounded-[18px] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-[13px] px-3 py-2 text-sm font-extrabold ${
                activeTab === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && <OverviewTab detail={detail} />}
      {activeTab === "questions" && <QuestionsTab detail={detail} />}
      {activeTab === "owners" && (
        <OwnersTab
          detail={detail}
          isChairman={isChairman}
          busyAction={busyAction}
          onPrintOwner={onPrintOwner}
          onReminderOwner={onReminderOwner}
        />
      )}
      {activeTab === "not_voted" && (
        <NotVotedTab
          detail={detail}
          isChairman={isChairman}
          busyAction={busyAction}
          onReminderAll={onReminderAll}
          onReminderOwner={onReminderOwner}
          onExport={onExport}
        />
      )}
      {activeTab === "properties" && <PropertiesTab detail={detail} />}
      {activeTab === "notifications" && (
        <NotificationsTab
          detail={detail}
          isChairman={isChairman}
          busyAction={busyAction}
          onReminderAll={onReminderAll}
        />
      )}
      {activeTab === "documents" && <DocumentsTab detail={detail} onExport={onExport} onReport={onReport} />}
      {activeTab === "procedure" && <ProcedureTab checks={detail.procedure.checks} status={detail.procedure.status} />}
      {activeTab === "log" && <LogTab detail={detail} />}
    </div>
  );
}

function DetailHeader({
  detail,
  selectedVotingSummary,
  isChairman,
  busyAction,
  onBack,
  onReminderAll,
  onExport,
  onReport,
  onPrintOwner,
}: {
  detail: VotingSummaryDetail;
  selectedVotingSummary: SelectedVotingSummary | null;
  isChairman: boolean;
  busyAction: string;
  onBack: () => void;
  onReminderAll: () => void;
  onExport: () => void;
  onReport: () => void;
  onPrintOwner: (ownerId: string) => void;
}) {
  const canSendReminder = isChairman && detail.voting.status === "active";
  const firstVotedOwner = detail.owners.find((owner) => owner.status === "voted");
  const meeting = selectedVotingSummary?.meeting;
  const meetingLocation = detail.voting.meeting_location || meeting?.location || "адрес не указан";
  const meetingInitiator = meeting?.initiator || "не указан";

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-500">
            <button type="button" onClick={onBack} className="font-bold text-blue-600 hover:underline">
              Свод голосований
            </button>
            <span className="mx-2">›</span>
            <span>Собрание {formatDateOnly(detail.voting.meeting_scheduled_at)}</span>
            <span className="mx-2">›</span>
            <b className="text-slate-800">{categoryLabel(detail.voting.category)}</b>
          </div>
          <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950">{detail.voting.title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Собрание от {formatDateOnly(detail.voting.meeting_scheduled_at)} · {meetingLocation} · Инициатор:{" "}
            {meetingInitiator}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label={categoryLabel(detail.voting.category)} color={categoryColor(detail.voting.category)} />
            <StatusBadge label={detail.voting.status_label} color={statusColor(detail.voting.status)} />
            <StatusBadge
              label={detail.voting.has_quorum ? "Кворум есть" : `Не хватает ${detail.voting.quorum_missing_votes}`}
              color={detail.voting.has_quorum ? "emerald" : "amber"}
            />
            <StatusBadge label={`Риск: ${riskLabel(detail.voting.risk_level)}`} color={riskColor(detail.voting.risk_level)} />
          </div>
        </div>
        <div className="flex max-w-3xl flex-wrap justify-end gap-2">
          <ActionButton label="← Назад" onClick={onBack} />
          {isChairman && (
            <ActionButton
              label="Напомнить не голосовавшим"
              onClick={onReminderAll}
              loading={busyAction === "reminder-all"}
              disabled={!canSendReminder}
              title={canSendReminder ? "" : "Напоминания доступны только при статусе «Идёт голосование»"}
              variant="green"
            />
          )}
          <ActionButton onClick={onExport} loading={busyAction === "detail-export"} label="Excel" />
          <ActionButton onClick={onReport} loading={busyAction === "report"} label="PDF-отчёт" />
          {isChairman && (
            <ActionButton label="Архив" disabled title="ZIP-архив пока не реализован в текущей версии" variant="dark" />
          )}
          <ActionButton
            label="Печать ОП"
            onClick={() => firstVotedOwner && onPrintOwner(firstVotedOwner.owner_id)}
            loading={firstVotedOwner ? busyAction === `print-${firstVotedOwner.owner_id}` : false}
            disabled={!isChairman || !firstVotedOwner}
            title={!isChairman ? "Персональная печать ограничена для роли Член совета дома" : !firstVotedOwner ? "Нет проголосовавших собственников" : ""}
          />
        </div>
      </div>

      <DetailKpis detail={detail} />
    </section>
  );
}

function DetailKpis({ detail }: { detail: VotingSummaryDetail }) {
  const signedOwners = detail.owners.filter((owner) => owner.status === "voted" && owner.signature.status === "signed").length;
  const pdfFormed = detail.owners.filter((owner) => owner.status === "voted" && owner.pdf_status === "formed").length;
  const votedOwners = detail.owners.filter((owner) => owner.status === "voted").length;
  const problemCount = detail.voting.risk_reasons.length + detail.voting.warnings.length;
  const quorumState = detail.voting.has_quorum ? "Есть" : detail.voting.quorum_missing_votes <= 25 ? "Почти" : "Нет";

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MiniKpi
        label="Кворум"
        value={quorumState}
        hint={`Нужно: ${detail.voting.quorum_required_votes}, не хватает: ${detail.voting.quorum_missing_votes}`}
        tone={detail.voting.has_quorum ? "good" : detail.voting.quorum_missing_votes <= 25 ? "warn" : "bad"}
      />
      <MiniKpi
        label="Проголосовали"
        value={`${detail.voting.voted_property_votes}/${detail.voting.total_property_votes}`}
        hint={`${formatPercent(detail.voting.participation_percent)} участия`}
      />
      <MiniKpi
        label="Подписанные голоса"
        value={`${signedOwners}/${votedOwners}`}
        hint="подпись проверяется отдельно"
      />
      <MiniKpi
        label="PDF опросников"
        value={`${pdfFormed}/${votedOwners}`}
        hint="для архива ОСИ"
      />
      <MiniKpi
        label="Риск процедуры"
        value={riskLabel(detail.voting.risk_level)}
        hint={`Проблемы: ${problemCount}`}
        tone={riskTone(detail.voting.risk_level)}
      />
    </div>
  );
}

function MiniKpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const valueColor = {
    default: "text-slate-950",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];

  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-extrabold text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${valueColor}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function OverviewTab({ detail }: { detail: VotingSummaryDetail }) {
  const timeline = buildTimeline(detail);
  const riskToneClass = {
    low: "border-emerald-200 bg-emerald-50 text-emerald-900",
    medium: "border-amber-200 bg-amber-50 text-amber-900",
    high: "border-red-200 bg-red-50 text-red-900",
  }[detail.voting.risk_level];

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-black text-slate-950">Главное по опросному листу</h2>
        <div className="mt-4 rounded-[20px] border border-blue-100 bg-gradient-to-br from-blue-50 to-violet-50 p-5">
          <div className="text-sm font-bold text-slate-500">Явка и кворум</div>
          <div className="mt-2 text-5xl font-black text-slate-950">
            {detail.voting.voted_property_votes}/{detail.voting.total_property_votes}
          </div>
          <ProgressBar
            value={detail.voting.participation_percent}
            tone={detail.voting.has_quorum ? "good" : detail.voting.quorum_missing_votes <= 25 ? "warn" : "bad"}
            size="large"
          />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            {detail.voting.has_quorum
              ? "Кворум состоялся. Можно анализировать принятие решений по каждому вопросу."
              : `Кворум пока не состоялся. До кворума не хватает ${detail.voting.quorum_missing_votes} голосов.`}
          </p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MiniKpi
            label="Решения"
            value={`${detail.voting.accepted_questions} из ${detail.voting.questions_count} проходят`}
            hint="по вопросам внутри ОП"
          />
          <MiniKpi label="Осталось" value={detailTimeState(detail)} hint="срок голосования" />
          <MiniKpi label="Формат" value={votingMethodSummary(detail.owners)} hint="по фактическим голосам" />
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-black text-slate-950">Прогноз и риск</h2>
        <div className={`mt-4 rounded-[20px] border p-5 ${riskToneClass}`}>
          <div className="text-lg font-black">Риск: {riskLabel(detail.voting.risk_level)}</div>
          <p className="mt-2 text-sm leading-6">
            {detail.voting.risk_level === "low"
              ? "Критичных замечаний не обнаружено. Контрольные признаки можно смотреть по чек-листу процедуры."
              : detail.voting.risk_level === "medium"
                ? "Есть замечания по кворуму, срокам или документам. Проверьте проблемные записи до завершения срока."
                : "Есть существенные замечания, требующие проверки по процедуре, подписям или комплекту документов."}
          </p>
        </div>
        <h3 className="mt-5 text-lg font-black text-slate-950">Линия времени</h3>
        <div className="mt-4 space-y-3">
          {timeline.map((item, index) => (
            <div key={`${item.title}-${item.date}`} className="grid grid-cols-[126px_1fr] gap-3">
              <div className="text-sm font-bold text-slate-700">{item.date}</div>
              <div className="relative pl-5">
                <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-blue-600 shadow-[0_0_0_4px_#dbeafe]" />
                {index < timeline.length - 1 && <div className="absolute left-[3px] top-5 h-[calc(100%+12px)] w-0.5 bg-slate-200" />}
                <div className="font-bold text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-500">{item.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuestionsTab({ detail }: { detail: VotingSummaryDetail }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <section className="space-y-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div>
        <h2 className="text-lg font-black text-slate-950">Вопросы и итоги</h2>
        <p className="mt-1 text-sm text-slate-500">
          Итоги считаются по голосам имущества. Не голосовавшие показаны отдельным статусом и не считаются как «против».
        </p>
      </div>
      {detail.questions.map((question) => {
        const total = Math.max(1, question.for_votes + question.against_votes + question.abstain_votes + question.not_voted_votes);
        return (
          <article key={question.id} className="rounded-[18px] border border-slate-200 p-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
              <div>
                <div className="text-xs font-extrabold text-slate-500">Вопрос №{question.number}</div>
                <h3 className="mt-1 text-base font-black leading-6 text-slate-950">{question.text}</h3>
                <div className="mt-4 space-y-2">
                  <AnswerBar label="За" value={question.for_votes} total={total} tone="good" />
                  <AnswerBar label="Против" value={question.against_votes} total={total} tone="bad" />
                  <AnswerBar label="Воздержались" value={question.abstain_votes} total={total} tone="warn" />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <QuestionStat label="За" value={question.for_votes} />
                <QuestionStat label="Против" value={question.against_votes} />
                <QuestionStat label="Воздержались" value={question.abstain_votes} />
                <QuestionStat label="Не голосовали" value={question.not_voted_votes} />
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3">
                  <StatusBadge label={questionResultLabel(question.result)} color={questionResultColor(question.result)} />
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [question.id]: !current[question.id] }))}
                    className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {expanded[question.id] ? "Скрыть" : "Разрез"}
                  </button>
                </div>
              </div>
            </div>
            {expanded[question.id] && <QuestionDetails question={question} />}
          </article>
        );
      })}
    </section>
  );
}

function QuestionStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function AnswerBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "good" | "warn" | "bad";
}) {
  const width = Math.min(100, (value / total) * 100);
  return (
    <div className="grid grid-cols-[120px_1fr_64px] items-center gap-3 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <ProgressBar value={width} tone={tone} />
      <b className="text-right text-slate-950">{value}</b>
    </div>
  );
}

function QuestionDetails({ question }: { question: VotingQuestionSummary }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <AnswerGroup title="За" items={question.details.for} />
      <AnswerGroup title="Против" items={question.details.against} />
      <AnswerGroup title="Воздержались" items={question.details.abstain} />
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
    <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-black text-slate-950">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-slate-500">Нет голосов</div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item.owner_id} className="rounded-xl bg-white p-2">
              <div className="font-bold text-slate-950">{item.owner_name}</div>
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
  detail,
  isChairman,
  busyAction,
  onPrintOwner,
  onReminderOwner,
}: {
  detail: VotingSummaryDetail;
  isChairman: boolean;
  busyAction: string;
  onPrintOwner: (ownerId: string) => void;
  onReminderOwner: (ownerId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [propertyType, setPropertyType] = useState("all");
  const [status, setStatus] = useState("all");
  const canSend = isChairman && detail.voting.status === "active";
  const propertyTypes = useMemo(() => uniquePropertyTypes(detail.owners), [detail.owners]);
  const owners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return detail.owners.filter((owner) => {
      const text = `${owner.owner_name} ${owner.property_label} ${owner.property_types} ${owner.email} ${owner.phone}`.toLowerCase();
      const typeMatch =
        propertyType === "all" ||
        owner.properties.some((property) => property.type === propertyType || property.type_label === propertyType);
      const statusMatch = status === "all" || owner.status === status;
      return (!query || text.includes(query)) && typeMatch && statusMatch;
    });
  }, [detail.owners, propertyType, search, status]);

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Собственники, имеющие право голосовать по выбранному ОП</h2>
          <p className="mt-1 text-sm text-slate-500">Колонка «Голосов по имуществу» отражает правило 1 имущество = 1 голос.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по ФИО или объекту"
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
          <select
            value={propertyType}
            onChange={(event) => setPropertyType(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="all">Все типы имущества</option>
            {propertyTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="all">Все статусы</option>
            <option value="voted">Проголосовали</option>
            <option value="not_voted">Не голосовали</option>
          </select>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1260px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <th className="px-4 py-3">Собственник</th>
              <th className="px-4 py-3">Объект</th>
              <th className="px-4 py-3">Тип имущества</th>
              <th className="px-4 py-3">Голосов по имуществу</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Ответ</th>
              <th className="px-4 py-3">Дата/способ</th>
              <th className="px-4 py-3">ЭЦП</th>
              <th className="px-4 py-3">PDF</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {owners.map((owner) => (
              <tr key={owner.owner_id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-bold text-slate-950">{owner.owner_name}</div>
                  <div className="text-xs text-slate-500">{owner.phone || owner.email || "Контакты не указаны"}</div>
                </td>
                <td className="px-4 py-3">{owner.property_label || "Не указано"}</td>
                <td className="px-4 py-3">{owner.property_types || "Не указано"}</td>
                <td className="px-4 py-3 font-black text-slate-950">{owner.property_votes}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={owner.status === "voted" ? "Проголосовал" : "Не голосовал"} color={owner.status === "voted" ? "emerald" : "amber"} />
                </td>
                <td className="px-4 py-3">{ownerAnswerSummary(owner)}</td>
                <td className="px-4 py-3">
                  <div>{formatDateTimeOrDash(owner.voted_at)}</div>
                  <div className="text-xs text-slate-500">{methodLabel(owner.method)}</div>
                </td>
                <td className="px-4 py-3">{signatureLabel(owner.signature.status)}</td>
                <td className="px-4 py-3">{owner.pdf_status === "formed" ? "Сформирован" : "Не сформирован"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {owner.status === "voted" ? (
                      <>
                        <ActionButton
                          label="Печать ОП"
                          onClick={() => onPrintOwner(owner.owner_id)}
                          loading={busyAction === `print-${owner.owner_id}`}
                          disabled={!isChairman}
                          title={!isChairman ? "Персональная печать ограничена для роли Член совета дома" : ""}
                          size="small"
                        />
                        <ActionButton
                          label="PDF"
                          disabled={owner.pdf_status !== "formed"}
                          title={owner.pdf_status === "formed" ? "" : "PDF собственника не сформирован"}
                          size="small"
                        />
                      </>
                    ) : (
                      <ActionButton
                        label="Напомнить"
                        onClick={() => onReminderOwner(owner.owner_id)}
                        loading={busyAction === `reminder-${owner.owner_id}`}
                        disabled={!canSend}
                        title={canSend ? "" : "Напоминания доступны только Председателю при идущем голосовании"}
                        size="small"
                        variant="primary"
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotVotedTab({
  detail,
  isChairman,
  busyAction,
  onReminderAll,
  onReminderOwner,
  onExport,
}: {
  detail: VotingSummaryDetail;
  isChairman: boolean;
  busyAction: string;
  onReminderAll: () => void;
  onReminderOwner: (ownerId: string) => void;
  onExport: () => void;
}) {
  const canSend = isChairman && detail.voting.status === "active";

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">Не голосовали</h2>
          <p className="mt-1 text-sm text-slate-500">Только собственники с объектами, подходящими под категорию выбранного ОП.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isChairman && (
            <ActionButton
              label="Напомнить всем"
              onClick={onReminderAll}
              loading={busyAction === "reminder-all"}
              disabled={!canSend}
              title={canSend ? "" : "Напоминания доступны только при статусе «Идёт голосование»"}
              variant="primary"
            />
          )}
          <ActionButton label="Список для обзвона" disabled title="Отдельный список обзвона пока не реализован. Используйте Excel." />
          <ActionButton label="Excel" onClick={onExport} loading={busyAction === "detail-export"} />
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <th className="px-4 py-3">Собственник</th>
              <th className="px-4 py-3">Объект</th>
              <th className="px-4 py-3">Контакты</th>
              <th className="px-4 py-3">Уведомление</th>
              <th className="px-4 py-3">Последнее напоминание</th>
              <th className="px-4 py-3">Голосов по имуществу</th>
              <th className="px-4 py-3">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.not_voted.map((owner: VotingNotVotedOwner) => (
              <tr key={owner.owner_id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-950">{owner.owner_name}</td>
                <td className="px-4 py-3">
                  <div>{owner.property_label || "Не указано"}</div>
                  <div className="text-xs text-slate-500">{owner.property_types || "Тип не указан"}</div>
                </td>
                <td className="px-4 py-3">
                  <div>{owner.phone || "Телефон не указан"}</div>
                  <div className="text-xs text-slate-500">{owner.email || "Email не указан"}</div>
                </td>
                <td className="px-4 py-3">{notificationStatusLabel(owner.notification_status)}</td>
                <td className="px-4 py-3">{formatDateTimeOrDash(owner.last_reminder_at)}</td>
                <td className="px-4 py-3 font-black text-slate-950">{owner.property_votes}</td>
                <td className="px-4 py-3">
                  <ActionButton
                    label="Напомнить"
                    onClick={() => onReminderOwner(owner.owner_id)}
                    loading={busyAction === `reminder-${owner.owner_id}`}
                    disabled={!canSend}
                    title={canSend ? "" : "Напоминания доступны только Председателю при идущем голосовании"}
                    size="small"
                    variant="primary"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PropertiesTab({ detail }: { detail: VotingSummaryDetail }) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <h2 className="text-lg font-black text-slate-950">Срез по имуществу</h2>
      <p className="mt-1 text-sm text-slate-500">
        В расчёт попадают только объекты, подходящие под категорию выбранного опросного листа.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <th className="px-4 py-3">Тип имущества</th>
              <th className="px-4 py-3">Всего в доме</th>
              <th className="px-4 py-3">Имеют право голосовать</th>
              <th className="px-4 py-3">Проголосовали объектами</th>
              <th className="px-4 py-3">Не голосовали объектами</th>
              <th className="px-4 py-3">Участие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.properties.map((item) => (
              <tr key={item.type} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-950">{item.type_label}</td>
                <td className="px-4 py-3">{item.total_objects}</td>
                <td className="px-4 py-3">{item.eligible_objects}</td>
                <td className="px-4 py-3">{item.voted_objects}</td>
                <td className="px-4 py-3">{item.not_voted_objects}</td>
                <td className="px-4 py-3">
                  <ProgressBar value={item.participation_percent} tone={item.participation_percent >= 50 ? "good" : "warn"} />
                  <div className="mt-1 text-xs text-slate-500">{formatPercent(item.participation_percent)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotificationsTab({
  detail,
  isChairman,
  busyAction,
  onReminderAll,
}: {
  detail: VotingSummaryDetail;
  isChairman: boolean;
  busyAction: string;
  onReminderAll: () => void;
}) {
  const canSend = isChairman && detail.voting.status === "active";
  const notRead = Math.max(0, detail.notifications.delivered - detail.notifications.read);
  const cards: Array<{
    title: string;
    value: number;
    tone: "default" | "good" | "warn" | "bad";
  }> = [
    { title: "Отправлено", value: detail.notifications.sent, tone: "default" },
    { title: "Доставлено", value: detail.notifications.delivered, tone: "good" },
    { title: "Не прочитали", value: notRead, tone: "warn" },
    { title: "Не доставлено", value: detail.notifications.failed, tone: "bad" },
    { title: "Нет контактов", value: detail.notifications.no_contacts, tone: "warn" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-black text-slate-950">Доставка уведомлений</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <MiniKpi
              key={card.title}
              label={card.title}
              value={String(card.value)}
              hint="по выбранному ОП"
              tone={card.tone}
            />
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
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
                <tr key={`${event.type}-${event.date || ""}`} className="hover:bg-slate-50">
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
      </section>
      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <h2 className="text-lg font-black text-slate-950">Управление явкой</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Напоминания доступны только Председателю и только при статусе «Идёт голосование».
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            label="Напомнить не голосовавшим"
            onClick={onReminderAll}
            loading={busyAction === "reminder-all"}
            disabled={!canSend}
            title={canSend ? "" : "Действие недоступно для текущей роли или статуса"}
            variant="primary"
          />
          <ActionButton label="Напомнить не читавшим" disabled title="Отдельная отправка по непрочитанным уведомлениям пока не реализована" />
          <ActionButton label="Список без контактов" disabled title="Отдельная выгрузка списка без контактов пока не реализована" />
        </div>
      </section>
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
  const items = normalizeDocumentItems(detail.documents.items);

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">Документы и архив</h2>
          <p className="mt-1 text-sm text-slate-500">Карточки показывают только доступные функции. Нереализованные действия отключены.</p>
        </div>
        <ActionButton label="Сформировать пакет" disabled title="ZIP-архив пока не реализован в текущей версии" variant="dark" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.code} className="rounded-[18px] border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-500">{item.description}</div>
              </div>
              <StatusBadge label={documentStatusLabel(item.status)} color={item.available ? "emerald" : "slate"} />
            </div>
            <div className="mt-4">
              {item.code === "summary_report" ? (
                <ActionButton label="Открыть" onClick={onReport} size="small" />
              ) : item.available && ["voted_registry", "not_voted_registry", "question_results"].includes(item.code) ? (
                <ActionButton label="Скачать" onClick={onExport} size="small" />
              ) : (
                <ActionButton label="Недоступно" disabled title={item.description} size="small" />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProcedureTab({ checks, status }: { checks: VotingProcedureCheck[]; status: string }) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <h2 className="text-lg font-black text-slate-950">Контроль процедуры</h2>
      <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-800">
        {status}
      </div>
      <div className="mt-4 grid gap-2">
        {checks.map((check) => {
          const ok = check.status === "ok";
          return (
            <div key={check.code} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-white p-3">
              <div>
                <div className="font-bold text-slate-950">{check.title}</div>
                {check.comment && <div className="mt-1 text-sm text-slate-500">{check.comment}</div>}
              </div>
              <span className={`text-xl ${ok ? "text-emerald-600" : "text-amber-600"}`}>{ok ? "✅" : "⚠️"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LogTab({ detail }: { detail: VotingSummaryDetail }) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <h2 className="text-lg font-black text-slate-950">Журнал действий</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Кто сделал</th>
              <th className="px-4 py-3">Роль/источник</th>
              <th className="px-4 py-3">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.action_log.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{formatDateTimeOrDash(item.created_at)}</td>
                <td className="px-4 py-3 font-bold text-slate-950">{actionLabel(item.action)}</td>
                <td className="px-4 py-3">{item.actor_name || "Система"}</td>
                <td className="px-4 py-3">{roleLabel(item.actor_role)}</td>
                <td className="px-4 py-3">{item.details || "Не указано"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActionButton({
  label,
  onClick,
  loading,
  disabled,
  title,
  variant = "default",
  size = "default",
}: {
  label: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "primary" | "green" | "dark" | "ghost";
  size?: "default" | "small";
}) {
  const variants = {
    default: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
    green: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
    dark: "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
    ghost: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
  };
  const sizeClass = size === "small" ? "rounded-[10px] px-3 py-2 text-xs" : "rounded-[13px] px-4 py-2.5 text-sm";

  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex items-center justify-center gap-2 border font-bold disabled:cursor-not-allowed disabled:opacity-55 ${sizeClass} ${variants[variant]}`}
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
  color: "blue" | "emerald" | "amber" | "red" | "slate" | "violet";
}) {
  const classes: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${classes[color]}`}>
      {label}
    </span>
  );
}

function ProgressBar({
  value,
  tone,
  size = "default",
}: {
  value: number;
  tone: "default" | "good" | "warn" | "bad";
  size?: "default" | "large";
}) {
  const colors = {
    default: "bg-blue-600",
    good: "bg-emerald-600",
    warn: "bg-amber-600",
    bad: "bg-red-600",
  };
  return (
    <div className={`mt-2 overflow-hidden rounded-full bg-slate-200 ${size === "large" ? "h-3" : "h-2.5"}`}>
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function QuorumBadge({ voting }: { voting: VotingSummaryListItem }) {
  if (voting.has_quorum) {
    return <StatusBadge label="Кворум есть" color="emerald" />;
  }
  if (voting.quorum_missing_votes <= 25) {
    return <StatusBadge label={`Не хватает ${voting.quorum_missing_votes}`} color="amber" />;
  }
  return <StatusBadge label={`Нет кворума · не хватает ${voting.quorum_missing_votes}`} color="red" />;
}

function Notice({ tone, text }: { tone: "success" | "error"; text: string }) {
  const classes = tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  return <div className={`rounded-[18px] p-3 text-sm font-semibold ${classes}`}>{text}</div>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
      {text}
    </div>
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

function categoryColor(category: VotingCategory | string): "blue" | "violet" | "slate" {
  if (category === "general") return "blue";
  if (category === "apartments_and_commercial") return "violet";
  return "slate";
}

function statusColor(status: string): "blue" | "emerald" | "red" | "slate" {
  if (status === "active") return "blue";
  if (status === "completed") return "emerald";
  if (status === "stopped") return "red";
  return "slate";
}

function statusTextClass(status: string) {
  if (status === "active") return "text-blue-600";
  if (status === "completed") return "text-emerald-600";
  if (status === "stopped") return "text-red-600";
  return "text-slate-700";
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

function riskTone(risk: string): "good" | "warn" | "bad" {
  if (risk === "high") return "bad";
  if (risk === "medium") return "warn";
  return "good";
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
  if (value === "paper") return "Бумажно";
  return value || "Онлайн";
}

function signatureLabel(value: string) {
  if (value === "signed") return "Проверена";
  if (value === "error") return "Ошибка";
  if (value === "not_required") return "Не требуется";
  return "Нет";
}

function answerLabel(value: string) {
  if (value === "for") return "За";
  if (value === "against") return "Против";
  if (value === "abstain") return "Воздержался";
  return value || "—";
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
    ready: "Готово",
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

function allVotings(summary: VotingSummaryResponse) {
  return summary.meetings.flatMap((meeting) => meeting.votings);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTimeOrDash(value?: string | null) {
  return value ? formatAstanaDateTime(value) : "Не указано";
}

function formatDateOnly(value?: string | null) {
  if (!value) return "дата не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatAstanaDateTime(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Almaty",
  }).format(date);
}

function detailTimeState(detail: VotingSummaryDetail) {
  if (detail.voting.status === "active" && typeof detail.voting.days_left === "number") {
    return `${detail.voting.days_left} дней`;
  }
  if (detail.voting.status === "stopped") {
    return "Остановлен";
  }
  if (detail.voting.status === "completed") {
    return "Завершён";
  }
  return "Не указано";
}

function votingMethodSummary(owners: VotingOwnerSummary[]) {
  const voted = owners.filter((owner) => owner.status === "voted");
  if (voted.length === 0) return "Онлайн";
  const hasPaper = voted.some((owner) => owner.signature.status === "not_required" || owner.method.toLowerCase().includes("paper"));
  const hasOnline = voted.some((owner) => owner.signature.status !== "not_required");
  if (hasPaper && hasOnline) return "Онлайн + бумага";
  if (hasPaper) return "Бумажно";
  return "Онлайн";
}

function buildTimeline(detail: VotingSummaryDetail) {
  const items = [
    {
      date: formatDateOnly(detail.voting.meeting_scheduled_at),
      title: "Собрание",
      hint: detail.voting.meeting_location || "Место не указано",
    },
    {
      date: formatDateTimeOrDash(detail.voting.publication_start_at),
      title: "Публикация ОП",
      hint: "Опросный лист открыт для собственников",
    },
    {
      date: formatDateTimeOrDash(detail.voting.publication_end_at),
      title: "Крайний срок",
      hint: "Голосование должно завершиться в допустимый период",
    },
  ];
  if (detail.voting.completed_at) {
    items.push({
      date: formatDateTimeOrDash(detail.voting.completed_at),
      title: "Фактическое завершение",
      hint: "Голосование завершено",
    });
  }
  if (detail.voting.stopped_at) {
    items.push({
      date: formatDateTimeOrDash(detail.voting.stopped_at),
      title: "Остановка",
      hint: "Голосование остановлено",
    });
  }
  return items;
}

function ownerAnswerSummary(owner: VotingOwnerSummary) {
  if (!owner.answers.length) return "—";
  return owner.answers.map((answer) => answerLabel(answer.answer)).join(" / ");
}

function uniquePropertyTypes(owners: VotingOwnerSummary[]) {
  const map = new Map<string, string>();
  owners.forEach((owner) => {
    owner.properties.forEach((property) => {
      map.set(property.type || property.type_label, property.type_label || property.type);
    });
  });
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
}

function normalizeDocumentItems(items: VotingDocumentItem[]): VotingDocumentItem[] {
  const extras: VotingDocumentItem[] = [
    {
      code: "protocol_results",
      title: "Протокол результатов",
      status: "not_implemented",
      available: false,
      description: "Отдельный протокол результатов пока не реализован",
    },
    {
      code: "signature_files",
      title: "Файлы и данные ЭЦП",
      status: "not_formed",
      available: false,
      description: "Отдельный пакет файлов ЭЦП пока не сформирован",
    },
  ];
  return [...items, ...extras];
}
