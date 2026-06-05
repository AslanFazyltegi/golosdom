"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { fetchCommunicationNotificationsForRole } from "@/lib/communications";
import {
  fetchInfocenterAnnouncements,
  fetchMyInfocenterAnnouncements,
} from "@/lib/infocenter-announcements";
import {
  fetchInfocenterNews,
  fetchMyInfocenterNews,
  infocenterNewsMediaUrl,
} from "@/lib/infocenter-news";
import { fetchPropertyCorrectionRequests } from "@/lib/objects";
import {
  fetchActiveVotings,
  fetchVotings,
  fetchVotingApproval,
  submitApprovalVote,
} from "@/lib/votings";
import { filterVotingsForDisplay } from "@/modules/votings";
import { formatAstanaDateTime } from "@/shared/lib/dateTime";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import type { CommunicationNotification } from "@/types/communications";
import type { InfocenterAnnouncement } from "@/types/infocenter-announcement";
import type { InfocenterNews, InfocenterNewsImage } from "@/types/infocenter-news";
import type { PropertyCorrectionRequest } from "@/types/objects";
import type { Voting, VotingApprovalReview, VotingApprovalVote } from "@/types/voting";

type OwnerDashboardData = {
  activeVotings: Voting[];
  news: InfocenterNews[];
  announcements: InfocenterAnnouncement[];
  notifications: CommunicationNotification[];
};

const emptyOwnerDashboardData: OwnerDashboardData = {
  activeVotings: [],
  news: [],
  announcements: [],
  notifications: [],
};

type BuildingDashboardStatistics = {
  apartments?: number;
  commercial?: number;
  storerooms?: number;
  parking?: number;
  totalProperties?: number;
  withoutOwner?: number;
  uniqueOwners?: number;
};

type BuildingDashboardData = {
  statistics?: BuildingDashboardStatistics | null;
};

type ChairmanDashboardData = {
  votings: Voting[];
  activeVotings: Voting[];
  correctionRequests: PropertyCorrectionRequest[];
  correctionPendingCount: number | null;
  news: InfocenterNews[];
  announcements: InfocenterAnnouncement[];
  notifications: CommunicationNotification[];
  buildingDashboard: BuildingDashboardData | null;
};

type CouncilDashboardData = {
  reviewVotings: Voting[];
  activeVotings: Voting[];
  approvals: Record<string, VotingApprovalReview>;
  news: InfocenterNews[];
  announcements: InfocenterAnnouncement[];
  notifications: CommunicationNotification[];
};

type ChairmanTask = {
  id: string;
  title: string;
  type: string;
  status: string;
  date?: string | null;
  actionLabel: string;
  moduleCode: string;
};

type LatestPublication = {
  id: string;
  title: string;
  type: "Новость" | "Объявление" | "Уведомление";
  date?: string | null;
  text: string;
  moduleCode: string;
};

const emptyChairmanDashboardData: ChairmanDashboardData = {
  votings: [],
  activeVotings: [],
  correctionRequests: [],
  correctionPendingCount: null,
  news: [],
  announcements: [],
  notifications: [],
  buildingDashboard: null,
};

const emptyCouncilDashboardData: CouncilDashboardData = {
  reviewVotings: [],
  activeVotings: [],
  approvals: {},
  news: [],
  announcements: [],
  notifications: [],
};

const attentionStatuses = ["council_review", "revision_required", "pending_publish"];

const sentNotificationStatuses = new Set([
  "sent",
  "partially_delivered",
  "delivered",
  "partially_read",
  "read",
  "completed",
]);

const approvalReasonLabels: Record<string, string> = {
  unclear_wording: "Неясная формулировка",
  data_error: "Ошибка в данных",
  procedure_violation: "Нарушение процедуры",
  missing_documents: "Не хватает документов",
  other: "Другое",
};

export function DashboardSummaryPage(props: CabinetModuleProps) {
  if (props.activeRole === "OWNER") {
    return <OwnerDashboardSummaryPage {...props} />;
  }

  if (props.activeRole === "CHAIRMAN") {
    return <ChairmanDashboardSummaryPage {...props} />;
  }

  if (isCouncilRole(props.activeRole)) {
    return <CouncilDashboardSummaryPage {...props} />;
  }

  return (
    <LegacyDashboardSummaryPage
      votings={props.votings}
      loadVotings={props.loadVotings}
    />
  );
}

function OwnerDashboardSummaryPage({
  activeRole,
  objects,
  openModule,
}: CabinetModuleProps) {
  const [data, setData] = useState<OwnerDashboardData>(emptyOwnerDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const results = await Promise.allSettled([
        fetchActiveVotings(),
        fetchMyInfocenterNews(),
        fetchMyInfocenterAnnouncements(),
        fetchCommunicationNotificationsForRole(activeRole),
      ]);

      if (cancelled) return;

      const [activeVotings, news, announcements, notifications] = results;
      setData({
        activeVotings: settledArray(activeVotings),
        news: settledArray(news),
        announcements: settledArray(announcements),
        notifications: settledArray(notifications),
      });

      const failed = results.some((result) => result.status === "rejected");
      setError(failed ? "Часть данных дашборда не загрузилась." : "");
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeRole]);

  const activeVotings = useMemo(
    () => filterVotingsForDisplay(data.activeVotings, objects, "OWNER", "all", ""),
    [data.activeVotings, objects],
  );

  const latestNews = useMemo(
    () =>
      sortByDateDesc(
        data.news.filter((item) => item.status === "published" && item.is_visible),
        (item) => item.published_at || item.created_at,
      ).slice(0, 3),
    [data.news],
  );

  const latestAnnouncements = useMemo(
    () =>
      sortByDateDesc(
        data.announcements.filter((item) => item.status === "published" && item.is_visible),
        (item) => item.published_at || item.actual_until || item.created_at,
      ).slice(0, 3),
    [data.announcements],
  );

  const latestNotifications = useMemo(
    () =>
      sortByDateDesc(
        data.notifications.filter((item) => item.status !== "hidden" && item.status !== "deleted"),
        (item) => item.sent_at || item.scheduled_at || item.created_at,
      ).slice(0, 3),
    [data.notifications],
  );

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Дашборд (сводка)</h1>

      {loading && (
        <p className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Загрузка данных...
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <DashboardSection
          title="Активные голосования"
          actionLabel="Все активные"
          onAction={() => openModule("votings_active")}
        >
          <ActiveVotingList
            votings={activeVotings}
            onOpen={() => openModule("votings_active")}
          />
        </DashboardSection>

        <DashboardSection
          title="Последние новости"
          actionLabel="Все новости"
          onAction={() => openModule("communication_news")}
        >
          <NewsList items={latestNews} onOpen={() => openModule("communication_news")} />
        </DashboardSection>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSection
          title="Последние объявления"
          actionLabel="Все объявления"
          onAction={() => openModule("communication_announcements")}
        >
          <AnnouncementsList
            items={latestAnnouncements}
            onOpen={() => openModule("communication_announcements")}
          />
        </DashboardSection>

        <DashboardSection
          title="Последние уведомления"
          actionLabel="Все уведомления"
          onAction={() => openModule("communication_notifications")}
        >
          <NotificationsList
            items={latestNotifications}
            onOpen={() => openModule("communication_notifications")}
          />
        </DashboardSection>
      </div>
    </>
  );
}

function ChairmanDashboardSummaryPage({ openModule }: CabinetModuleProps) {
  const [data, setData] = useState<ChairmanDashboardData>(emptyChairmanDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const result = await loadChairmanDashboardData();
      if (cancelled) return;

      setData(result.data);
      setError(result.failed ? "Часть данных дашборда не загрузилась." : "");
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const statusCounts = useMemo(
    () => ({
      councilReview: countVotingsByStatus(data.votings, "council_review"),
      revisionRequired: countVotingsByStatus(data.votings, "revision_required"),
      pendingPublish: countVotingsByStatus(data.votings, "pending_publish"),
    }),
    [data.votings],
  );

  const activeVotings = useMemo(
    () => filterVotingsForDisplay(data.activeVotings, null, "CHAIRMAN", "all", ""),
    [data.activeVotings],
  );

  const tasks = useMemo(() => buildChairmanTasks(data), [data]);

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Дашборд председателя</h1>

      {loading && (
        <p className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Загрузка данных...
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <SummaryActionCard
          title="На утверждении у совета"
          value={statusCounts.councilReview}
          caption="Опросные листы"
          onClick={() => openModule("voting_constructor_approval")}
        />
        <SummaryActionCard
          title="На доработке"
          value={statusCounts.revisionRequired}
          caption="Опросные листы"
          onClick={() => openModule("voting_constructor_revision")}
        />
        <SummaryActionCard
          title="Ожидают публикации"
          value={statusCounts.pendingPublish}
          caption="Опросные листы"
          onClick={() => openModule("voting_constructor_pending_publication")}
        />
        <SummaryActionCard
          title="Запросы на корректировку"
          value={formatMaybeNumber(data.correctionPendingCount)}
          caption="Новые заявки"
          onClick={() => openModule("my_building")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <DashboardSection title="Текущие задачи" actionLabel="Мой МЖК" onAction={() => openModule("my_building")}>
          <ChairmanTasksList tasks={tasks} onOpen={openModule} />
        </DashboardSection>

        <DashboardSection
          title="Активные голосования"
          actionLabel="Все активные"
          onAction={() => openModule("votings_active")}
        >
          <ActiveVotingProgressList
            votings={activeVotings}
            buttonLabel="Посмотреть результаты"
            emptyText="Активных голосований нет"
            onOpen={() => openModule("votings_active")}
          />
        </DashboardSection>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSection title="Инфоцентр" actionLabel="Новости" onAction={() => openModule("communication_news")}>
          <InfocenterSummary
            news={data.news}
            announcements={data.announcements}
            notifications={data.notifications}
            openModule={openModule}
          />
        </DashboardSection>

        <DashboardSection title="Состояние МЖК" actionLabel="Открыть Мой МЖК" onAction={() => openModule("my_building")}>
          <BuildingState
            statistics={data.buildingDashboard?.statistics ?? null}
            correctionPendingCount={data.correctionPendingCount}
          />
        </DashboardSection>
      </div>
    </>
  );
}

function CouncilDashboardSummaryPage({
  activeRole,
  user,
  openModule,
  loadVotings,
}: CabinetModuleProps) {
  const [data, setData] = useState<CouncilDashboardData>(emptyCouncilDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voteError, setVoteError] = useState("");
  const [submittingVotingID, setSubmittingVotingID] = useState<string | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<Voting | null>(null);
  const [revisionReason, setRevisionReason] = useState("unclear_wording");
  const [revisionComment, setRevisionComment] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const result = await loadCouncilDashboardData(activeRole);
      if (cancelled) return;

      setData(result.data);
      setError(result.failed ? "Часть данных дашборда не загрузилась." : "");
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeRole]);

  const summary = useMemo(
    () => buildCouncilSummary(data, user.id),
    [data, user.id],
  );

  const activeVotings = useMemo(
    () => filterVotingsForDisplay(data.activeVotings, null, "CHAIRMAN", "all", ""),
    [data.activeVotings],
  );

  const publications = useMemo(() => buildLatestPublications(data), [data]);
  const revisionApproval = revisionTarget ? data.approvals[revisionTarget.id] : null;
  const existingRevisionVote = findRevisionVoteWithComment(revisionApproval?.votes ?? []);

  async function reloadAfterCouncilVote() {
    const result = await loadCouncilDashboardData(activeRole);
    setData(result.data);
    setError(result.failed ? "Часть данных дашборда не загрузилась." : "");
    await Promise.resolve(loadVotings());
  }

  async function handleApprove(voting: Voting) {
    if (submittingVotingID) return;

    try {
      setVoteError("");
      setSubmittingVotingID(voting.id);
      await submitApprovalVote(voting.id, { decision: "approve" });
      await reloadAfterCouncilVote();
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Не удалось отправить решение");
    } finally {
      setSubmittingVotingID(null);
    }
  }

  async function handleRevisionSubmit() {
    if (!revisionTarget || submittingVotingID) return;

    if (!existingRevisionVote && !revisionComment.trim()) {
      setVoteError("Укажите комментарий для возврата на доработку.");
      return;
    }

    try {
      setVoteError("");
      setSubmittingVotingID(revisionTarget.id);
      await submitApprovalVote(
        revisionTarget.id,
        existingRevisionVote
          ? { decision: "revision" }
          : {
              decision: "revision",
              reason: revisionReason,
              comment: revisionComment.trim(),
            },
      );
      setRevisionTarget(null);
      setRevisionComment("");
      setRevisionReason("unclear_wording");
      await reloadAfterCouncilVote();
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Не удалось отправить решение");
    } finally {
      setSubmittingVotingID(null);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Дашборд совета дома</h1>

      {loading && (
        <p className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Загрузка данных...
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}
      {voteError && (
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {voteError}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <SummaryActionCard
          title="На моём рассмотрении"
          value={summary.pendingForMe}
          caption="Опросные листы"
          onClick={() => openModule("voting_constructor_approval")}
        />
        <SummaryActionCard
          title="Я согласовал"
          value={summary.approvedByMe}
          caption="Решения"
        />
        <SummaryActionCard
          title="Вернул на доработку"
          value={summary.revisionByMe}
          caption="Решения"
        />
        <SummaryActionCard
          title="Активные голосования"
          value={activeVotings.length}
          caption="Опросные листы"
          onClick={() => openModule("votings_active")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <DashboardSection
          title="Опросники на утверждении"
          actionLabel="Открыть раздел"
          onAction={() => openModule("voting_constructor_approval")}
        >
          <CouncilApprovalList
            votings={data.reviewVotings}
            approvals={data.approvals}
            userID={user.id}
            submittingVotingID={submittingVotingID}
            onOpen={() => openModule("voting_constructor_approval")}
            onApprove={handleApprove}
            onRevision={(voting) => {
              setVoteError("");
              setRevisionTarget(voting);
              setRevisionComment("");
              setRevisionReason("unclear_wording");
            }}
          />
        </DashboardSection>

        <DashboardSection
          title="Решения совета"
          actionLabel="Открыть раздел"
          onAction={() => openModule("voting_constructor_approval")}
        >
          <CouncilDecisionList votings={data.reviewVotings} approvals={data.approvals} />
        </DashboardSection>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSection
          title="Активные голосования"
          actionLabel="Все активные"
          onAction={() => openModule("votings_active")}
        >
          <ActiveVotingProgressList
            votings={activeVotings}
            buttonLabel="Посмотреть"
            emptyText="Активных голосований нет"
            onOpen={() => openModule("votings_active")}
          />
        </DashboardSection>

        <DashboardSection title="Последние публикации" actionLabel="Инфоцентр" onAction={() => openModule("communication_news")}>
          <LatestPublicationsList items={publications} onOpen={openModule} />
        </DashboardSection>
      </div>

      {revisionTarget && (
        <CouncilRevisionModal
          existingRevisionVote={existingRevisionVote}
          reason={revisionReason}
          comment={revisionComment}
          submitting={submittingVotingID === revisionTarget.id}
          onReasonChange={setRevisionReason}
          onCommentChange={setRevisionComment}
          onClose={() => {
            setRevisionTarget(null);
            setRevisionComment("");
          }}
          onSubmit={handleRevisionSubmit}
        />
      )}
    </>
  );
}

async function loadChairmanDashboardData() {
  const results = await Promise.allSettled([
    fetchVotings(),
    fetchActiveVotings(),
    fetchPropertyCorrectionRequests(),
    apiFetch("/api/v1/objects/dashboard") as Promise<BuildingDashboardData>,
    fetchInfocenterNews({ status: "all" }),
    fetchInfocenterAnnouncements({ status: "all" }),
    fetchCommunicationNotificationsForRole("CHAIRMAN", { status: "all" }),
  ]);

  const [
    votings,
    activeVotings,
    correctionRequests,
    buildingDashboard,
    news,
    announcements,
    notifications,
  ] = results;
  const correctionData =
    correctionRequests.status === "fulfilled" ? correctionRequests.value : null;

  return {
    data: {
      votings: settledArray(votings),
      activeVotings: settledArray(activeVotings),
      correctionRequests: correctionData?.requests ?? [],
      correctionPendingCount: correctionData?.pendingCount ?? null,
      buildingDashboard: settledValue(buildingDashboard, null),
      news: settledArray(news),
      announcements: settledArray(announcements),
      notifications: settledArray(notifications),
    },
    failed: results.some((result) => result.status === "rejected"),
  };
}

async function loadCouncilDashboardData(activeRole: string) {
  const notificationRole = activeRole === "COUNCIL" ? "COUNCIL_MEMBER" : activeRole;
  const results = await Promise.allSettled([
    fetchVotings("council_review"),
    fetchActiveVotings(),
    fetchMyInfocenterNews(),
    fetchMyInfocenterAnnouncements(),
    fetchCommunicationNotificationsForRole(notificationRole),
  ]);

  const [reviewVotings, activeVotings, news, announcements, notifications] = results;
  const safeReviewVotings = settledArray(reviewVotings);
  const approvals = await loadApprovalMap(safeReviewVotings);

  return {
    data: {
      reviewVotings: safeReviewVotings,
      activeVotings: settledArray(activeVotings),
      approvals,
      news: settledArray(news),
      announcements: settledArray(announcements),
      notifications: settledArray(notifications),
    },
    failed: results.some((result) => result.status === "rejected"),
  };
}

async function loadApprovalMap(votings: Voting[]) {
  const entries = await Promise.allSettled(
    votings.map(async (voting) => ({
      votingID: voting.id,
      approval: await fetchVotingApproval(voting.id),
    })),
  );
  const approvals: Record<string, VotingApprovalReview> = {};

  entries.forEach((entry) => {
    if (entry.status === "fulfilled") {
      approvals[entry.value.votingID] = entry.value.approval;
    }
  });

  return approvals;
}

function DashboardSection({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            {actionLabel} ›
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ActiveVotingList({
  votings,
  onOpen,
}: {
  votings: Voting[];
  onOpen: () => void;
}) {
  if (votings.length === 0) {
    return <EmptyState text="Активных опросных листов нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {votings.map((voting) => {
        const hasVoted = Boolean(voting.user_has_voted);
        return (
          <article key={voting.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">
                  {voting.title || "Опросный лист"}
                </h3>
                {voting.description && (
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                    {voting.description}
                  </p>
                )}
              </div>
              <span
                className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  hasVoted
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {hasVoted ? "Вы прошли голосование" : "Вы не голосовали"}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpen}
              className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Перейти в активные голосования
            </button>
          </article>
        );
      })}
    </div>
  );
}

function SummaryActionCard({
  title,
  value,
  caption,
  onClick,
}: {
  title: string;
  value: number | string;
  caption: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{caption}</p>
    </>
  );
  const className =
    "rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function ChairmanTasksList({
  tasks,
  onOpen,
}: {
  tasks: ChairmanTask[];
  onOpen: (moduleCode: string) => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState text="Нет задач, требующих внимания" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {tasks.map((task) => (
        <article key={task.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900">{task.title}</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                  {task.type}
                </span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                  {task.status}
                </span>
                {task.date && (
                  <span className="px-2 py-1 text-slate-500">{formatDate(task.date)}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpen(task.moduleCode)}
              className="w-fit shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {task.actionLabel}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ActiveVotingProgressList({
  votings,
  buttonLabel,
  emptyText,
  onOpen,
}: {
  votings: Voting[];
  buttonLabel: string;
  emptyText: string;
  onOpen: () => void;
}) {
  if (votings.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {votings.map((voting) => {
        const metrics = buildVotingProgressMetrics(voting);

        return (
          <article key={voting.id} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">
                  {voting.title || "Опросный лист"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatVotingPeriod(voting)}
                </p>
              </div>
              <span className="w-fit shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {votingStatusLabel(voting.status)}
              </span>
            </div>

            {metrics.length > 0 && (
              <dl className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-xl bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-semibold text-slate-500">{metric.label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-900">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <button
              type="button"
              onClick={onOpen}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {buttonLabel}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function InfocenterSummary({
  news,
  announcements,
  notifications,
  openModule,
}: {
  news: InfocenterNews[];
  announcements: InfocenterAnnouncement[];
  notifications: CommunicationNotification[];
  openModule: (moduleCode: string) => void;
}) {
  const notificationStats = buildNotificationStats(notifications);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoMetricGroup
          title="Новости"
          items={[
            ["Опубликовано", countBy(news, (item) => item.status === "published")],
            ["Черновики", countBy(news, (item) => item.status === "draft")],
            ["Скрытые", countBy(news, (item) => item.status === "hidden")],
          ]}
        />
        <InfoMetricGroup
          title="Объявления"
          items={[
            ["Активные", countBy(announcements, isActiveAnnouncement)],
            ["Черновики", countBy(announcements, (item) => item.status === "draft")],
            ["Скрытые", countBy(announcements, (item) => item.status === "hidden")],
          ]}
        />
        <InfoMetricGroup
          title="Уведомления"
          items={[
            ["Отправлено", notificationStats.sent],
            ["Прочитано", notificationStats.read],
            ["Не прочитано", notificationStats.unread],
          ]}
        />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-sm font-semibold text-slate-500">Быстрые действия</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openModule("communication_news")}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Создать новость
          </button>
          <button
            type="button"
            onClick={() => openModule("communication_announcements")}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Создать объявление
          </button>
          <button
            type="button"
            onClick={() => openModule("communication_notifications")}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Создать уведомление
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoMetricGroup({
  title,
  items,
}: {
  title: string;
  items: Array<[string, number | null]>;
}) {
  const visibleItems = items.filter(([, value]) => value !== null);

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <h3 className="mb-3 font-semibold text-slate-900">{title}</h3>
      <dl className="space-y-2">
        {visibleItems.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BuildingState({
  statistics,
  correctionPendingCount,
}: {
  statistics: BuildingDashboardStatistics | null;
  correctionPendingCount: number | null;
}) {
  const rows = [
    ["Всего объектов", statistics?.totalProperties],
    ["Квартир", statistics?.apartments],
    ["Нежилых помещений", statistics?.commercial],
    ["Кладовых", statistics?.storerooms],
    ["Паркомест", statistics?.parking],
    ["Количество собственников", statistics?.uniqueOwners],
    ["Объекты без собственника", statistics?.withoutOwner],
    ["Активные заявки на корректировку", correctionPendingCount],
  ].filter(([, value]) => isNumber(value));

  if (rows.length === 0) {
    return <EmptyState text="Данные по МЖК не загрузились" />;
  }

  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="text-base font-semibold text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CouncilApprovalList({
  votings,
  approvals,
  userID,
  submittingVotingID,
  onOpen,
  onApprove,
  onRevision,
}: {
  votings: Voting[];
  approvals: Record<string, VotingApprovalReview>;
  userID: string;
  submittingVotingID: string | null;
  onOpen: () => void;
  onApprove: (voting: Voting) => void;
  onRevision: (voting: Voting) => void;
}) {
  if (votings.length === 0) {
    return <EmptyState text="Опросников на утверждении нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {votings.map((voting) => {
        const approval = approvals[voting.id];
        const currentVote = getCurrentUserVote(approval, userID);
        const alreadyVoted = Boolean(currentVote);
        const reviewClosed = approval ? approval.status !== "in_progress" : true;
        const canVote = Boolean(approval) && !alreadyVoted && !reviewClosed;
        const submitting = submittingVotingID === voting.id;

        return (
          <article key={voting.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{voting.title}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    Дата собрания: {formatDate(voting.meeting?.scheduled_at)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    Вопросов: {voting.questions?.length ?? 0}
                  </span>
                  {(approval?.deadline || voting.review_deadline) && (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                      Дедлайн: {formatDate(approval?.deadline || voting.review_deadline)}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-1 ${currentVote ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
                  >
                    {councilUserDecisionLabel(currentVote)}
                  </span>
                </div>
                {currentVote && (
                  <p className="mt-2 text-sm text-slate-500">
                    Дата решения: {formatDate(currentVote.updated_at || currentVote.created_at)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpen}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Открыть
                </button>
                {!alreadyVoted && (
                  <>
                    <button
                      type="button"
                      onClick={() => onApprove(voting)}
                      disabled={!canVote || submitting}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Утвердить
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevision(voting)}
                      disabled={!canVote || submitting}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      На доработку
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CouncilDecisionList({
  votings,
  approvals,
}: {
  votings: Voting[];
  approvals: Record<string, VotingApprovalReview>;
}) {
  if (votings.length === 0) {
    return <EmptyState text="Решений совета нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {votings.map((voting) => {
        const approval = approvals[voting.id];

        return (
          <article key={voting.id} className="py-4 first:pt-0 last:pb-0">
            <h3 className="line-clamp-2 font-semibold text-slate-900">{voting.title}</h3>
            {approval ? (
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MetricBox label="Утвердили" value={approval.approve_count} />
                <MetricBox label="На доработку" value={approval.revision_count} />
                <MetricBox label="Не проголосовали" value={approval.pending_council_members} />
                <MetricBox label="Итоговый статус" value={councilFinalStatusLabel(approval.status)} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Данные согласования не загрузились</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function LatestPublicationsList({
  items,
  onOpen,
}: {
  items: LatestPublication[];
  onOpen: (moduleCode: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState text="Публикаций нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <button
          key={`${item.type}-${item.id}`}
          type="button"
          onClick={() => onOpen(item.moduleCode)}
          className="block w-full py-4 text-left first:pt-0 last:pb-0 hover:bg-slate-50/60"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              {item.type}
            </span>
            <span className="text-slate-500">{formatDate(item.date)}</span>
          </div>
          <h3 className="line-clamp-2 font-semibold text-slate-900">{item.title}</h3>
          {item.text && (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
              {item.text}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function CouncilRevisionModal({
  existingRevisionVote,
  reason,
  comment,
  submitting,
  onReasonChange,
  onCommentChange,
  onClose,
  onSubmit,
}: {
  existingRevisionVote?: VotingApprovalVote;
  reason: string;
  comment: string;
  submitting: boolean;
  onReasonChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-xl font-semibold text-slate-900">Отправить на доработку</h2>
        {existingRevisionVote ? (
          <div className="mb-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Причина:{" "}
              {existingRevisionVote.reason
                ? approvalReasonLabels[existingRevisionVote.reason] || existingRevisionVote.reason
                : "Не указана"}
            </p>
            {existingRevisionVote.comment && (
              <p className="mt-2">Комментарий: {existingRevisionVote.comment}</p>
            )}
          </div>
        ) : (
          <div className="mb-5 grid gap-3">
            <select
              className="rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            >
              {Object.entries(approvalReasonLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              className="min-h-28 rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="Комментарий"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || (!existingRevisionVote && !comment.trim())}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {existingRevisionVote ? "Согласиться с доработкой" : "Отправить замечание"}
          </button>
        </div>
      </section>
    </div>
  );
}

function NewsList({
  items,
  onOpen,
}: {
  items: InfocenterNews[];
  onOpen: () => void;
}) {
  if (items.length === 0) {
    return <EmptyState text="Новостей нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => {
        const cover = coverImage(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={onOpen}
            className="flex w-full gap-4 py-4 text-left first:pt-0 last:pb-0 hover:bg-slate-50/60"
          >
            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {cover && (
                <img
                  src={infocenterNewsMediaUrl(cover.file_url)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">
                {formatDate(item.published_at || item.created_at)}
              </p>
              <h3 className="mt-1 line-clamp-2 font-semibold text-slate-900">
                {item.title}
              </h3>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                  {item.summary}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AnnouncementsList({
  items,
  onOpen,
}: {
  items: InfocenterAnnouncement[];
  onOpen: () => void;
}) {
  if (items.length === 0) {
    return <EmptyState text="Объявлений нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={onOpen}
          className="block w-full py-4 text-left first:pt-0 last:pb-0 hover:bg-slate-50/60"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-slate-500">{announcementDate(item)}</span>
            {item.is_important && (
              <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                Важное
              </span>
            )}
            {item.actual_until && (
              <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                Актуально
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 font-semibold text-slate-900">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
            {stripHtml(item.body_html)}
          </p>
        </button>
      ))}
    </div>
  );
}

function NotificationsList({
  items,
  onOpen,
}: {
  items: CommunicationNotification[];
  onOpen: () => void;
}) {
  if (items.length === 0) {
    return <EmptyState text="Уведомлений нет" />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={onOpen}
          className="block w-full py-4 text-left first:pt-0 last:pb-0 hover:bg-slate-50/60"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-slate-500">
              {formatDate(item.sent_at || item.created_at)}
            </span>
            <span
              className={`rounded-full px-2 py-1 ${
                item.read_at
                  ? "bg-slate-100 text-slate-600"
                  : "bg-red-600 text-white"
              }`}
            >
              {item.read_at ? "Прочитано" : "Не прочитано"}
            </span>
          </div>
          <h3 className="line-clamp-2 font-semibold text-slate-900">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
            {stripHtml(item.body_html || item.body)}
          </p>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

function LegacyDashboardSummaryPage({
  votings,
  loadVotings,
}: Pick<CabinetModuleProps, "votings" | "loadVotings">) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Дашборд (сводка)</h1>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="🏢" title="Мои объекты" value="1" />
        <StatCard
          icon="✅"
          title="Голосования"
          value={String(votings.length)}
        />
        <StatCard icon="👥" title="Онлайн-собрания" value="0" />
        <StatCard icon="🔔" title="Уведомления" value="0" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-semibold">Последние голосования</h2>
            <button onClick={loadVotings} className="text-sm text-blue-600">
              Обновить ›
            </button>
          </div>

          <LegacyVotingList votings={votings.slice(0, 3)} />
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-semibold">Последние новости</h2>
            <button className="text-sm text-blue-600">Все новости ›</button>
          </div>

          <LegacyNewsItem
            title="Благоустройство дворовой территории"
            date="20.05.2024"
          />
          <LegacyNewsItem title="Плановое отключение воды" date="18.05.2024" />
          <LegacyNewsItem
            title="Отчёт управляющей компании за апрель"
            date="15.05.2024"
          />
        </section>
      </div>
    </>
  );
}

function LegacyVotingList({
  votings,
}: {
  votings: CabinetModuleProps["votings"];
}) {
  if (votings.length === 0) {
    return <p className="text-slate-500">Пока нет доступных голосований.</p>;
  }

  return (
    <div className="space-y-4">
      {votings.map((voting) => (
        <div key={voting.id} className="border-b pb-4 last:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{voting.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {voting.description || "Без описания"}
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
              {voting.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-2xl">
          {icon}
        </div>
        <span className="text-slate-400">•••</span>
      </div>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function LegacyNewsItem({ title, date }: { title: string; date: string }) {
  return (
    <div className="flex items-center justify-between border-b py-4 last:border-b-0">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{date} · 10:30</p>
      </div>
      <div className="h-14 w-20 rounded-xl bg-slate-100" />
    </div>
  );
}

function settledArray<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === "fulfilled" && Array.isArray(result.value)
    ? result.value
    : [];
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function isCouncilRole(role: string) {
  return role === "COUNCIL_MEMBER" || role === "COUNCIL";
}

function countVotingsByStatus(votings: Voting[], status: string) {
  return countBy(votings, (voting) => voting.status === status);
}

function countBy<T>(items: T[], predicate: (item: T) => boolean) {
  return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}

function buildChairmanTasks(data: ChairmanDashboardData): ChairmanTask[] {
  const votingTasks = data.votings
    .filter((voting) => attentionStatuses.includes(voting.status))
    .map((voting) => {
      const meta = chairmanVotingTaskMeta(voting.status);
      return {
        id: `voting-${voting.id}`,
        title: voting.title || "Опросный лист",
        type: meta.type,
        status: meta.status,
        date: voting.updated_at || voting.created_at,
        actionLabel: meta.actionLabel,
        moduleCode: meta.moduleCode,
      };
    });

  const correctionTasks = data.correctionRequests
    .filter(isPendingCorrectionRequest)
    .map((request) => ({
      id: `correction-${request.id}`,
      title: correctionRequestTitle(request),
      type: "Запрос на корректировку",
      status: "Ожидает обработки",
      date: request.createdAt,
      actionLabel: "Открыть",
      moduleCode: "my_building",
    }));

  return sortByDateDesc([...votingTasks, ...correctionTasks], (task) => task.date);
}

function chairmanVotingTaskMeta(status: string) {
  if (status === "council_review") {
    return {
      type: "Опросник на утверждении",
      status: "На утверждении у совета",
      actionLabel: "Рассмотреть",
      moduleCode: "voting_constructor_approval",
    };
  }

  if (status === "revision_required") {
    return {
      type: "Опросник на доработке",
      status: "На доработке",
      actionLabel: "Открыть",
      moduleCode: "voting_constructor_revision",
    };
  }

  return {
    type: "Опросник к публикации",
    status: "Ожидает публикации",
    actionLabel: "Запланировать",
    moduleCode: "voting_constructor_pending_publication",
  };
}

function buildCouncilSummary(data: CouncilDashboardData, userID: string) {
  const approvals = Object.values(data.approvals);
  const userVotes = approvals.flatMap((approval) =>
    (approval.votes ?? []).filter((vote) => vote.user_id === userID),
  );

  return {
    pendingForMe: data.reviewVotings.filter((voting) => {
      const approval = data.approvals[voting.id];
      return approval?.status === "in_progress" && !getCurrentUserVote(approval, userID);
    }).length,
    approvedByMe: countBy(userVotes, (vote) => vote.decision === "approve"),
    revisionByMe: countBy(userVotes, (vote) => vote.decision === "revision"),
  };
}

function buildLatestPublications(data: CouncilDashboardData): LatestPublication[] {
  const news = data.news
    .filter((item) => item.status === "published" && item.is_visible)
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: "Новость" as const,
      date: item.published_at || item.created_at,
      text: item.summary || stripHtml(item.body_html),
      moduleCode: "communication_news",
    }));
  const announcements = data.announcements
    .filter((item) => item.status === "published" && item.is_visible)
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: "Объявление" as const,
      date: item.published_at || item.actual_until || item.created_at,
      text: stripHtml(item.body_html),
      moduleCode: "communication_announcements",
    }));
  const notifications = data.notifications
    .filter((item) => item.status !== "hidden" && item.status !== "deleted")
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: "Уведомление" as const,
      date: item.sent_at || item.scheduled_at || item.created_at,
      text: stripHtml(item.body_html || item.body),
      moduleCode: "communication_notifications",
    }));

  return sortByDateDesc(
    [...news, ...announcements, ...notifications],
    (item) => item.date,
  ).slice(0, 5);
}

function buildVotingProgressMetrics(voting: Voting) {
  const metrics: Array<{ label: string; value: string }> = [];
  const total = voting.total_owners_count;
  const voted = voting.voted_owners_count;

  if (isNumber(voted)) {
    metrics.push({
      label: "Проголосовало",
      value: isNumber(total) ? `${voted} из ${total}` : String(voted),
    });
  }

  if (isNumber(total) && isNumber(voted)) {
    metrics.push({
      label: "Не проголосовало",
      value: String(Math.max(total - voted, 0)),
    });
    metrics.push({
      label: "Участие",
      value: total > 0 ? `${Math.round((voted / total) * 100)}%` : "0%",
    });
  }

  const daysLeft = daysLeftLabel(voting.publication_end_at);
  if (daysLeft) {
    metrics.push({ label: "До завершения", value: daysLeft });
  }

  return metrics;
}

function buildNotificationStats(notifications: CommunicationNotification[]) {
  const sent = countBy(notifications, (item) => sentNotificationStatuses.has(item.status));
  const recipients = notifications.reduce(
    (sum, item) => sum + (item.delivery_stats?.recipients ?? 0),
    0,
  );
  const read = notifications.reduce((sum, item) => sum + (item.delivery_stats?.read ?? 0), 0);

  return {
    sent,
    read: recipients > 0 ? read : null,
    unread: recipients > 0 ? Math.max(recipients - read, 0) : null,
  };
}

function sortByDateDesc<T>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
) {
  return [...items].sort(
    (left, right) => dateTimeValue(getDate(right)) - dateTimeValue(getDate(left)),
  );
}

function dateTimeValue(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null) {
  return value ? formatAstanaDateTime(value) : "Дата не указана";
}

function formatMaybeNumber(value: number | null) {
  return isNumber(value) ? String(value) : "—";
}

function formatVotingPeriod(voting: Voting) {
  const start = voting.publication_start_at;
  const end = voting.publication_end_at;

  if (start && end) {
    return `${formatAstanaDateTime(start)} — ${formatAstanaDateTime(end)}`;
  }
  if (start) return `Начало: ${formatAstanaDateTime(start)}`;
  if (end) return `Окончание: ${formatAstanaDateTime(end)}`;
  return "Срок не указан";
}

function announcementDate(item: InfocenterAnnouncement) {
  if (item.actual_until) return `Актуально до ${formatAstanaDateTime(item.actual_until)}`;
  return formatDate(item.published_at || item.created_at);
}

function votingStatusLabel(status: string) {
  if (status === "active" || status === "published") return "Активно";
  return status || "Статус не указан";
}

function daysLeftLabel(value?: string | null) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";

  const days = Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Срок завершён";
  if (days === 0) return "Последний день";
  return `${days} дн.`;
}

function councilUserDecisionLabel(vote?: VotingApprovalVote) {
  if (!vote) return "Не рассмотрено";
  return vote.decision === "approve" ? "Утвердили" : "Вернули на доработку";
}

function councilFinalStatusLabel(status: VotingApprovalReview["status"]) {
  if (status === "approved") return "Утверждено";
  if (status === "revision_required") return "Возвращено на доработку";
  return "Ожидает решения";
}

function getCurrentUserVote(approval: VotingApprovalReview | undefined, userID: string) {
  return (approval?.votes ?? []).find((vote) => vote.user_id === userID);
}

function findRevisionVoteWithComment(votes: VotingApprovalVote[]) {
  return votes.find(
    (vote) => vote.decision === "revision" && (vote.reason || vote.comment),
  );
}

function isActiveAnnouncement(item: InfocenterAnnouncement) {
  if (item.status !== "published" || !item.is_visible) return false;
  if (!item.actual_until) return true;

  const timestamp = Date.parse(item.actual_until);
  return Number.isFinite(timestamp) ? timestamp >= Date.now() : true;
}

function isPendingCorrectionRequest(request: PropertyCorrectionRequest) {
  return request.status === "pending" || (!request.processedAt && request.status !== "processed");
}

function correctionRequestTitle(request: PropertyCorrectionRequest) {
  const property = [request.propertyType, request.propertyNumber].filter(Boolean).join(" ");
  if (property && request.requestType) return `${property}: ${request.requestType}`;
  return property || request.requestType || "Запрос на корректировку";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coverImage(item: InfocenterNews): InfocenterNewsImage | undefined {
  return item.images.find((image) => image.id === item.cover_image_id) || item.images[0];
}
