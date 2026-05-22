"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchMeetings } from "@/lib/meetings";
import {
  createVotingDraft,
  deleteVoting,
  fetchVotingApproval,
  fetchVotings,
  resubmitVotingToCouncil,
  scheduleVotingPublication,
  submitApprovalVote,
  submitVotingToCouncil,
  updateVotingDraft,
} from "@/lib/votings";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import {
  addAstanaDays,
  addAstanaMonths,
  endOfAstanaDay,
  formatAstanaDate,
  formatAstanaDateTime,
  formatAstanaDateTimeLocal,
  formatAstanaTime,
  parseAstanaDateTimeLocal,
  setAstanaTime,
  startOfAstanaDay,
} from "@/shared/lib/dateTime";
import { Placeholder } from "@/shared/ui/Placeholder";
import type { Meeting } from "@/types/meeting";
import type {
  Voting,
  VotingApprovalReview,
  VotingApprovalVote,
  VotingCouncilSubmitPayload,
  VotingDraftPayload,
  VotingPublicationSchedulePayload,
  VotingQuestion,
  VotingSavePayload,
} from "@/types/voting";

type WizardStep = 1 | 2 | 3;
const DEFAULT_OPTIONS = ["Да", "Нет", "Воздержался"];
const MIN_VOTING_DAYS = 7;

const reasonLabels: Record<string, string> = {
  unclear_wording: "Неясная формулировка",
  data_error: "Ошибка в данных",
  procedure_violation: "Нарушение процедуры",
  missing_documents: "Не хватает документов",
  other: "Другое",
};

export function VotingConstructorPage(props: CabinetModuleProps) {
  const isChairman = props.activeRole === "CHAIRMAN";
  const isCouncil = props.activeRole === "COUNCIL_MEMBER" || isChairman;

  if (props.activeComponent === "voting_constructor_approval") {
    if (!isCouncil) {
      return <NoAccess />;
    }
    return (
      <VotingCouncilReviewPage
        userID={props.user.id}
        reloadCounters={props.loadVotings}
      />
    );
  }

  if (props.activeComponent === "voting_constructor_revision") {
    if (!isCouncil) {
      return <NoAccess />;
    }
    return <VotingRevisionPage isChairman={isChairman} />;
  }

  if (props.activeComponent === "voting_constructor_pending_publication") {
    if (!isCouncil) {
      return <NoAccess />;
    }
    return <VotingPendingPublishPage isChairman={isChairman} />;
  }

  if (props.activeComponent === "voting_constructor_published") {
    if (!isCouncil) {
      return <NoAccess />;
    }
    return <VotingPublishedPage />;
  }

  if (!isChairman) {
    return <NoAccess />;
  }

  if (
    props.activeComponent === "voting_constructor" ||
    props.activeComponent === "voting_constructor_create"
  ) {
    const initialVoting = props.votingConstructorInitial;
    return (
      <VotingWizard
        key={initialVoting ? `${initialVoting.id}-${initialVoting.status}` : "new"}
        initialVoting={initialVoting ?? undefined}
        onSaved={props.loadVotings}
      />
    );
  }

  if (props.activeComponent === "voting_constructor_draft") {
    return <VotingDraftsPage />;
  }

  return (
    <Placeholder
      title="Конструктор голосования"
      text="Этот раздел конструктора пока не подключён."
    />
  );
}

function VotingWizard({
  initialVoting,
  onSaved,
}: {
  initialVoting?: Voting;
  onSaved?: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [votingID, setVotingID] = useState(initialVoting?.id || "");
  const [title] = useState(initialVoting?.title || "Опросный лист");
  const [description] = useState(initialVoting?.description || "");
  const [questions, setQuestions] = useState<VotingQuestion[]>(
    normalizeVotingQuestions(initialVoting?.questions),
  );
  const [meetingID, setMeetingID] = useState(initialVoting?.meeting_id || "");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingComponent, setPendingComponent] = useState("");

  const filledQuestions = useMemo(
    () => questions.filter((question) => (question.text ?? "").trim()),
    [questions],
  );
  const hasQuestions = filledQuestions.length > 0;
  const selectedMeeting =
    meetings.find((meeting) => meeting.id === meetingID) ??
    (meetingID && initialVoting?.meeting?.id === meetingID ? initialVoting.meeting : undefined);

  useEffect(() => {
    window.__votingConstructorDirty = dirty && hasQuestions;
    return () => {
      window.__votingConstructorDirty = false;
    };
  }, [dirty, hasQuestions]);

  useEffect(() => {
    function onNavigationRequest(event: Event) {
      const custom = event as CustomEvent<{ component: string }>;
      setPendingComponent(custom.detail.component);
      setSaveModalOpen(true);
    }
    window.addEventListener("voting-constructor-navigation-request", onNavigationRequest);
    return () =>
      window.removeEventListener(
        "voting-constructor-navigation-request",
        onNavigationRequest,
      );
  }, []);

  useEffect(() => {
    if (step !== 2 && step !== 3) return;

    async function load() {
      try {
        setLoadingMeetings(true);
        setMeetings(await fetchMeetings("upcoming"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить собрания");
      } finally {
        setLoadingMeetings(false);
      }
    }

    void load();
  }, [step]);

  function updateQuestions(value: VotingQuestion[]) {
    setDirty(true);
    setQuestions(value);
  }

  function updateMeetingID(value: string) {
    setDirty(true);
    setMeetingID(value);
  }

  async function persistVoting(payload: VotingSavePayload) {
    setError("");
    setSaving(true);
    try {
      const saved = votingID
        ? await updateVotingDraft(votingID, payload)
        : await createVotingDraft(payload);
      setVotingID(saved.id);
      setDirty(false);
      window.__votingConstructorDirty = false;
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить черновик");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    return persistVoting(buildDraftPayload(title, description, questions));
  }

  async function saveForCouncilSubmit() {
    return persistVoting(
      buildCouncilSubmitPayload(title, description, meetingID, questions),
    );
  }

  async function submitToCouncil() {
    const saved = await saveForCouncilSubmit();
    if (!saved) return;

    try {
      setSaving(true);
      const result =
        initialVoting?.status === "revision_required"
          ? await resubmitVotingToCouncil(saved.id)
          : await submitVotingToCouncil(saved.id);
      setWarning(result.warning || "");
      window.__votingConstructorDirty = false;
      onSaved?.();
      confirmNavigation("voting_constructor_approval");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить на утверждение");
    } finally {
      setSaving(false);
    }
  }

  async function saveAndLeave() {
    const saved = await saveDraft();
    if (!saved) return;
    onSaved?.();
    setSaveModalOpen(false);
    confirmNavigation(pendingComponent);
  }

  async function saveDraftAndOpenDrafts() {
    const saved = await saveDraft();
    if (!saved) return;
    onSaved?.();
    confirmNavigation("voting_constructor_draft");
  }

  function discardAndLeave() {
    setQuestions([{ id: "", text: "", options: DEFAULT_OPTIONS }]);
    setDirty(false);
    setSaveModalOpen(false);
    confirmNavigation(pendingComponent);
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-slate-500">Конструктор голосования</p>
        <h1 className="text-3xl font-bold">Создать опросник</h1>
      </div>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-8 flex flex-wrap gap-2">
          {["Вопросы", "Данные собрания", "Предпросмотр"].map((label, index) => (
            <span
              key={label}
              className={`rounded-md border px-3 py-2 text-sm ${
                step === index + 1
                  ? "border-violet-500 bg-violet-50 font-semibold text-violet-700"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>

        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {warning && (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">{warning}</p>
        )}

        {step === 1 && (
          <VotingQuestionsStep
            questions={questions}
            setQuestions={updateQuestions}
          />
        )}

        {step === 2 && (
          <VotingMeetingStep
            meetings={meetings}
            selectedMeeting={selectedMeeting}
            meetingID={meetingID}
            loading={loadingMeetings}
            setMeetingID={updateMeetingID}
          />
        )}

        {step === 3 && (
          <VotingPreviewStep
            title={title}
            description={description}
            questions={filledQuestions}
            meeting={selectedMeeting}
          />
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {step > 1 && <Button onClick={() => setStep((step - 1) as WizardStep)}>Назад</Button>}
          {step < 3 && (
            <Button
              variant="primary"
              onClick={() => setStep((step + 1) as WizardStep)}
              disabled={step === 1 ? !hasQuestions : !meetingID}
            >
              Далее
            </Button>
          )}
          {step === 3 && (
            <>
              <Button onClick={saveDraftAndOpenDrafts} disabled={saving}>
                Сохранить черновик
              </Button>
              <Button variant="primary" onClick={submitToCouncil} disabled={saving || !meetingID}>
                Отправить на утверждение
              </Button>
            </>
          )}
        </div>
      </section>

      <SaveDraftModal
        open={saveModalOpen}
        saving={saving}
        onDiscard={discardAndLeave}
        onSave={saveAndLeave}
      />
    </>
  );
}

function VotingQuestionsStep({
  questions,
  setQuestions,
}: {
  questions: VotingQuestion[];
  setQuestions: (value: VotingQuestion[]) => void;
}) {
  function updateQuestion(index: number, patch: Partial<VotingQuestion>) {
    setQuestions(
      questions.map((question, currentIndex) =>
        currentIndex === index ? { ...question, ...patch } : question,
      ),
    );
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-lg border bg-white p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Вопросы для голосования
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Добавьте вопросы, которые будут включены в опросный лист.
            </p>
          </div>
          <div className="rounded-md border bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
            Всего вопросов:{" "}
            {questions.filter((question) => (question.text ?? "").trim()).length}
          </div>
        </div>

        <div className="grid gap-3">
          {questions.map((question, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900">Вопрос {index + 1}</h3>
                <Button
                  onClick={() =>
                    setQuestions(questions.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Удалить
                </Button>
              </div>
              <textarea
                className="min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-violet-500"
                value={question.text}
                onChange={(event) =>
                  updateQuestion(index, {
                    text: event.target.value,
                    options: getQuestionOptions(question),
                  })
                }
                placeholder="Текст вопроса"
              />
            </div>
          ))}

          <Button
            className="w-full border-violet-400 py-3 font-semibold text-violet-700"
            onClick={() =>
              setQuestions([
                ...questions,
                { id: "", text: "", options: DEFAULT_OPTIONS },
              ])
            }
          >
            Добавить вопрос
          </Button>
        </div>
      </div>
    </div>
  );
}

function VotingMeetingStep({
  meetings,
  selectedMeeting,
  meetingID,
  loading,
  setMeetingID,
}: {
  meetings: Meeting[];
  selectedMeeting?: Meeting | NonNullable<Voting["meeting"]> | null;
  meetingID: string;
  loading: boolean;
  setMeetingID: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {loading ? (
        <p className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
          Загрузка собраний...
        </p>
      ) : meetings.length === 0 ? (
        <p className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
          Нет предстоящих собраний
        </p>
      ) : (
        <select
          className="rounded-md border p-3"
          value={meetingID}
          onChange={(event) => setMeetingID(event.target.value)}
        >
          <option value="">Выберите собрание</option>
          {meetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {formatDate(meeting.scheduled_at)} - {meeting.location}
            </option>
          ))}
        </select>
      )}

      {selectedMeeting && <MeetingInfo meeting={selectedMeeting} />}
    </div>
  );
}

function VotingPreviewStep({
  title,
  description,
  questions,
  meeting,
}: {
  title: string;
  description: string;
  questions: VotingQuestion[];
  meeting?: Meeting | NonNullable<Voting["meeting"]> | null;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-slate-600">{description}</p>}
      </div>
      {meeting ? <MeetingInfo meeting={meeting} /> : <p>Собрание не выбрано</p>}
      <QuestionList questions={questions} />
    </div>
  );
}

function VotingDraftsPage() {
  return (
    <VotingStatusPage
      title="Черновик"
      status="draft"
      actions={(voting, reload) => (
        <>
          <Button variant="primary" onClick={() => openVotingWizard(voting)}>
            Продолжить заполнение
          </Button>
          <Button
            onClick={async () => {
              await deleteVoting(voting.id);
              await reload();
            }}
          >
            Удалить
          </Button>
        </>
      )}
    />
  );
}

function VotingRevisionPage({ isChairman }: { isChairman: boolean }) {
  return (
    <VotingStatusPage
      title="На доработке"
      status="revision_required"
      actions={(voting) =>
        isChairman ? (
          <Button variant="primary" onClick={() => openVotingWizard(voting)}>
            Редактировать
          </Button>
        ) : null
      }
      showRevisionDetails
    />
  );
}

function VotingPendingPublishPage({ isChairman }: { isChairman: boolean }) {
  return (
    <VotingStatusPage
      title="Ожидающие публикации"
      status="pending_publish"
      emptyText="Нет опросных листов, ожидающих публикации."
      actions={
        isChairman
          ? (voting, reload) => (
              <PublicationScheduleActions
                voting={voting}
                reload={reload}
              />
            )
          : undefined
      }
      showPublicationSchedule
    />
  );
}

function VotingPublishedPage() {
  return (
    <VotingStatusPage
      title="Опубликованные"
      status="published"
      emptyText="Опубликованных опросных листов пока нет."
    />
  );
}

function VotingCouncilReviewPage({
  userID,
  reloadCounters,
}: {
  userID: string;
  reloadCounters?: () => void;
}) {
  return (
    <VotingStatusPage
      title="На утверждении у совета дома"
      status="council_review"
      showApproval
      actions={(voting, reload) => (
        <ApprovalActions
          voting={voting}
          userID={userID}
          reload={reload}
          reloadCounters={reloadCounters}
        />
      )}
    />
  );
}

function VotingStatusPage({
  title,
  status,
  emptyText = "Список пуст.",
  actions,
  showApproval = false,
  showRevisionDetails = false,
  showPublicationSchedule = false,
}: {
  title: string;
  status: string;
  emptyText?: string;
  actions?: (voting: Voting, reload: () => Promise<void>) => ReactNode;
  showApproval?: boolean;
  showRevisionDetails?: boolean;
  showPublicationSchedule?: boolean;
}) {
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  async function load() {
    try {
      setError("");
      setLoading(true);
      const items = await fetchVotings(status);
      setVotings(Array.isArray(items) ? items : []);
      setRefreshToken((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить опросники");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetchVotings(status)
      .then((items) => {
        if (!active) return;
        setVotings(Array.isArray(items) ? items : []);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Не удалось загрузить опросники");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [status]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{title}</h1>
        <Button onClick={load}>Обновить</Button>
      </div>
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p>Загрузка...</p>
      ) : votings.length === 0 ? (
        <Placeholder title="" text={emptyText} />
      ) : (
        <div className="grid gap-4">
          {votings.map((voting) => (
            <VotingCard
              key={voting.id}
              voting={voting}
              showApproval={showApproval}
              showRevisionDetails={showRevisionDetails}
              showPublicationSchedule={showPublicationSchedule}
              refreshToken={refreshToken}
            >
              {actions?.(voting, load)}
            </VotingCard>
          ))}
        </div>
      )}
    </>
  );
}

function VotingCard({
  voting,
  children,
  showApproval,
  showRevisionDetails,
  showPublicationSchedule,
  refreshToken,
}: {
  voting: Voting;
  children?: ReactNode;
  showApproval?: boolean;
  showRevisionDetails?: boolean;
  showPublicationSchedule?: boolean;
  refreshToken: number;
}) {
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{voting.title}</h2>
          <p className="text-sm text-slate-500">Версия {voting.version || 1}</p>
          {voting.description && <p className="mt-1 text-slate-600">{voting.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
      {voting.meeting && <MeetingInfo meeting={voting.meeting} />}
      {showPublicationSchedule && <PublicationScheduleDetails voting={voting} />}
      {showRevisionDetails && (
        <VotingApprovalDetails
          votingID={voting.id}
          refreshToken={refreshToken}
          compact
          showVotes={false}
          showRevisionSummary
        />
      )}
      {showApproval && (
        <VotingApprovalDetails
          votingID={voting.id}
          refreshToken={refreshToken}
          showVotes={false}
        />
      )}
      <QuestionList questions={voting.questions ?? []} />
    </section>
  );
}

function VotingApprovalDetails({
  votingID,
  refreshToken,
  compact = false,
  showRevisionSummary = false,
}: {
  votingID: string;
  refreshToken: number;
  compact?: boolean;
  showVotes?: boolean;
  showRevisionSummary?: boolean;
}) {
  const [approval, setApproval] = useState<VotingApprovalReview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setApproval(await fetchVotingApproval(votingID));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить согласование");
      }
    }
    void load();
  }, [votingID, refreshToken]);

  if (error) return <p className="mt-4 text-sm text-red-600">{error}</p>;
  if (!approval) return <p className="mt-4 text-sm text-slate-500">Загрузка согласования...</p>;

  const votes = approval.votes ?? [];
  const revisionVotes = votes.filter((vote) => vote.decision === "revision");
  const revisionDetails = revisionVotes.filter((vote) => vote.reason || vote.comment);
  const revisionVote = showRevisionSummary
    ? findRevisionVoteWithComment(votes)
    : undefined;
  const revisionDate = showRevisionSummary
    ? approval.updated_at ?? revisionVote?.created_at
    : undefined;

  return (
    <div
      className={`mb-4 rounded-md p-4 ${
        compact ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"
      }`}
    >
      <div className="grid gap-1 text-sm">
        <p>Дедлайн: {formatDate(approval.deadline)}</p>
        {revisionDate && <p>Отправлено на доработку: {formatDate(revisionDate)}</p>}
        <p>Утвердили: {approval.approve_count}</p>
        <p>На доработку: {approval.revision_count}</p>
        {revisionDetails.map((vote) => (
          <div key={vote.id} className="ml-4 text-slate-600">
            {vote.reason && <p>Причина: {reasonLabels[vote.reason] || vote.reason}</p>}
            {vote.comment && <p>Комментарий: {vote.comment}</p>}
          </div>
        ))}
        <p>Не проголосовали: {approval.pending_council_members}</p>
        {approval.no_majority_reason && (
          <p className="text-amber-700">{approval.no_majority_reason}</p>
        )}
      </div>
    </div>
  );
}

function PublicationScheduleDetails({ voting }: { voting: Voting }) {
  const limits = getPublicationScheduleLimits(voting);
  const scheduledStartAt = parseServerDateTime(voting.publication_start_at);
  const scheduledEndAt = parseServerDateTime(voting.publication_end_at);
  const expired = isPublicationSchedulingExpired(voting);
  const hasScheduledPublication =
    voting.publication_status === "scheduled" &&
    scheduledStartAt !== null &&
    scheduledEndAt !== null;

  return (
    <div className="mb-4 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
      <p className="mb-2 font-medium">Сроки голосования:</p>
      {limits ? (
        <div className="grid gap-1">
          <p>Собрание: {formatMeetingDate(limits.meetingDate)}</p>
          <p>Опрос можно открыть с: {formatMeetingDate(limits.earliestStartDate)}</p>
          <p>Последний допустимый старт: {formatMeetingDate(limits.latestStartDate)}</p>
          <p>Крайний срок завершения: {formatMeetingDate(limits.finalDeadlineDate)}</p>
          <p>Минимальная длительность: {MIN_VOTING_DAYS} дней</p>
          <div className="mt-3">
            <p className="font-medium">Рекомендуемый период:</p>
            <p>
              {formatPublicationDateTime(limits.recommendedStart)} —{" "}
              {formatPublicationDateTime(limits.recommendedEnd)}
            </p>
          </div>
          {expired && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-red-700">
              Срок публикации истёк. Минимальная длительность голосования — 7 дней,
              поэтому опрос уже нельзя открыть в пределах допустимого срока.
            </p>
          )}
        </div>
      ) : (
        <p>У опросника нет привязанного собрания с датой. Планирование недоступно.</p>
      )}
      {hasScheduledPublication && scheduledStartAt && scheduledEndAt && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="mb-2 font-medium">Публикация запланирована:</p>
          <div className="grid gap-1">
            <p>Начало голосования: {formatDate(scheduledStartAt)}</p>
            <p>Завершение голосования: {formatDate(scheduledEndAt)}</p>
            <p>
              Уведомление:{" "}
              {voting.publication_send_notifications
                ? "будет отправлено при открытии голосования"
                : "не будет отправлено автоматически"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicationScheduleActions({
  voting,
  reload,
}: {
  voting: Voting;
  reload: () => Promise<void>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const scheduled = voting.publication_status === "scheduled";
  const expired = isPublicationSchedulingExpired(voting);

  async function removeVoting() {
    try {
      setDeleting(true);
      setError("");
      await deleteVoting(voting.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить опросник");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-2">
      {expired ? (
        <Button onClick={removeVoting} disabled={deleting}>
          Удалить
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => {
            setSuccess("");
            setError("");
            setModalOpen(true);
          }}
        >
          {scheduled ? "Изменить расписание" : "Запланировать публикацию"}
        </Button>
      )}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {modalOpen && (
        <PublicationScheduleModal
          voting={voting}
          onClose={() => setModalOpen(false)}
          onScheduled={async () => {
            await reload();
            setSuccess("Публикация запланирована.");
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PublicationScheduleModal({
  voting,
  onClose,
  onScheduled,
}: {
  voting: Voting;
  onClose: () => void;
  onScheduled: () => Promise<void>;
}) {
  const limits = getPublicationScheduleLimits(voting);
  const [startAt, setStartAt] = useState(() => getInitialPublicationStart(voting, limits));
  const [endAt, setEndAt] = useState(() => getInitialPublicationEnd(voting, limits));
  const [sendNotifications, setSendNotifications] = useState(
    Boolean(voting.publication_send_notifications),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const validationError = validatePublicationSchedule(limits, startAt, endAt);
    if (validationError) {
      setError(validationError);
      return;
    }

    const startDate = parseDateTimeLocal(startAt);
    const endDate = parseDateTimeLocal(endAt);
    if (!startDate || !endDate) {
      setError("Укажите дату и время начала и завершения голосования.");
      return;
    }

    const payload: VotingPublicationSchedulePayload = {
      start_at: formatPayloadDateTime(startDate),
      end_at: formatPayloadDateTime(endDate),
      send_notifications: sendNotifications,
    };

    try {
      setSubmitting(true);
      setError("");
      await scheduleVotingPublication(voting.id, payload);
      setSubmitting(false);
      await onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запланировать публикацию");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold">Запланировать публикацию</h2>
        <div className="mb-5 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          {limits ? (
            <div className="grid gap-1">
              <p>Дата собрания: {formatMeetingDate(limits.meetingDate)}</p>
              <p>Минимальная дата начала: {formatMeetingDate(limits.earliestStartDate)}</p>
              <p>Последний допустимый старт: {formatMeetingDate(limits.latestStartDate)}</p>
              <p>Крайний срок завершения: {formatMeetingDate(limits.finalDeadlineDate)}</p>
              <p>Минимальная длительность: {MIN_VOTING_DAYS} дней</p>
            </div>
          ) : (
            <p className="text-red-600">
              У опросника нет привязанного собрания с датой. Планирование недоступно.
            </p>
          )}
        </div>
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Дата и время начала голосования</span>
            <input
              type="datetime-local"
              className="rounded-md border p-2"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              disabled={!limits || submitting}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Дата и время завершения голосования</span>
            <input
              type="datetime-local"
              className="rounded-md border p-2"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              disabled={!limits || submitting}
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={sendNotifications}
              onChange={(event) => setSendNotifications(event.target.checked)}
              disabled={!limits || submitting}
            />
            <span>Отправить уведомление собственникам при открытии голосования</span>
          </label>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button variant="primary" onClick={submit} disabled={!limits || submitting}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApprovalActions({
  voting,
  userID,
  reload,
  reloadCounters,
}: {
  voting: Voting;
  userID: string;
  reload: () => Promise<void>;
  reloadCounters?: () => void;
}) {
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [approval, setApproval] = useState<VotingApprovalReview | null>(null);
  const [reason, setReason] = useState("unclear_wording");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const currentApproval = await fetchVotingApproval(voting.id);
        if (active) {
          setApproval(currentApproval);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить согласование");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [voting.id]);

  const votes = approval?.votes ?? [];
  const currentUserVote = votes.find((vote) => vote.user_id === userID);
  const revisionVote = findRevisionVoteWithComment(votes);
  const alreadyVoted = Boolean(currentUserVote);
  const reviewClosed = approval ? approval.status !== "in_progress" : false;
  const actionsDisabled = submitting || !approval || alreadyVoted || reviewClosed;

  async function refreshWorkflow(approvalReview: VotingApprovalReview) {
    setApproval(approvalReview);
    setRevisionOpen(false);
    await reload();
    await Promise.resolve(reloadCounters?.());
  }

  async function voteApprove() {
    if (actionsDisabled || submittingRef.current) return;

    try {
      setError("");
      submittingRef.current = true;
      setSubmitting(true);
      const approvalReview = await submitApprovalVote(voting.id, { decision: "approve" });
      await refreshWorkflow(approvalReview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось проголосовать");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function voteRevision() {
    if (actionsDisabled || submittingRef.current) return;

    try {
      setError("");
      submittingRef.current = true;
      setSubmitting(true);
      const approvalReview = await submitApprovalVote(
        voting.id,
        revisionVote
          ? { decision: "revision" }
          : { decision: "revision", reason, comment },
      );
      await refreshWorkflow(approvalReview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось проголосовать");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={voteApprove} disabled={actionsDisabled}>
          Утвердить
        </Button>
        <Button onClick={() => setRevisionOpen(true)} disabled={actionsDisabled}>
          На доработку
        </Button>
      </div>
      {alreadyVoted && (
        <p className="text-sm text-slate-500">
          Ваше решение:{" "}
          {currentUserVote?.decision === "approve" ? "Утвердить" : "На доработку"}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {revisionOpen && (
        <RevisionVoteModal
          existingRevisionVote={revisionVote}
          reason={reason}
          comment={comment}
          submitting={submitting}
          onReasonChange={setReason}
          onCommentChange={setComment}
          onClose={() => setRevisionOpen(false)}
          onSubmit={voteRevision}
        />
      )}
    </div>
  );
}

function RevisionVoteModal({
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
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-xl font-semibold">Отправить на доработку</h2>
        {existingRevisionVote ? (
          <div className="mb-5 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Причина:{" "}
              {existingRevisionVote.reason
                ? reasonLabels[existingRevisionVote.reason] || existingRevisionVote.reason
                : "Не указана"}
            </p>
            {existingRevisionVote.comment && (
              <p className="mt-2">Комментарий: {existingRevisionVote.comment}</p>
            )}
          </div>
        ) : (
          <div className="mb-5 grid gap-3">
            <select
              className="rounded-md border p-2"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            >
              {Object.entries(reasonLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              className="min-h-28 rounded-md border p-2"
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="Комментарий"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={submitting || (!existingRevisionVote && !comment.trim())}
          >
            {existingRevisionVote ? "Согласиться с доработкой" : "Отправить замечание"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveDraftModal({
  open,
  saving,
  onDiscard,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-xl font-semibold">Сохранить опросник в черновик?</h2>
        <p className="mb-6 text-slate-600">
          Вы добавили вопросы, но не отправили опросник на утверждение. Чтобы не потерять
          данные, сохраните его как черновик.
        </p>
        <div className="flex justify-end gap-3">
          <Button onClick={onDiscard}>Не сохранять</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            Сохранить в черновик
          </Button>
        </div>
      </div>
    </div>
  );
}

function MeetingInfo({ meeting }: { meeting: Meeting | NonNullable<Voting["meeting"]> }) {
  const agenda = normalizeAgenda(meeting.agenda);

  return (
    <div className="mb-4 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
      <p>Инициатор: {meeting.initiator_name}</p>
      <p>Дата: {formatMeetingDate(meeting.scheduled_at)}</p>
      <p>Место: {meeting.location}</p>
      <p>Форма: {meeting.meeting_form || "offline"}</p>
      {agenda.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2">Повестка:</p>
          <ol className="list-inside list-decimal space-y-1">
            {agenda.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3">Повестка: Не указана</p>
      )}
    </div>
  );
}

function QuestionList({ questions }: { questions: VotingQuestion[] }) {
  const safeQuestions = questions ?? [];

  return (
    <div className="grid gap-3">
      {safeQuestions.map((question, index) => (
        <div
          key={`${question.id}-${index}`}
          className="rounded-md border p-4"
        >
          <p className="font-medium">
            {index + 1}. {question.text ?? ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "border-blue-600 bg-blue-600 text-white"
          : "bg-white text-slate-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function NoAccess() {
  return (
    <Placeholder
      title="Нет доступа"
      text="У вашей активной роли нет доступа к этому разделу конструктора голосования."
    />
  );
}

function buildDraftPayload(
  title: string,
  description: string,
  questions: VotingQuestion[],
): VotingDraftPayload {
  return {
    title,
    description,
    questions: buildQuestionPayload(questions),
  };
}

function buildCouncilSubmitPayload(
  title: string,
  description: string,
  meetingID: string,
  questions: VotingQuestion[],
): VotingCouncilSubmitPayload {
  return {
    ...buildDraftPayload(title, description, questions),
    meeting_id: meetingID || null,
  };
}

function buildQuestionPayload(questions: VotingQuestion[]) {
  return (questions ?? [])
    .map((question) => ({
      ...question,
      text: (question.text ?? "").trim(),
      options: getQuestionOptions(question)
        .map((option) => String(option).trim())
        .filter(Boolean),
    }))
    .filter((question) => question.text);
}

function normalizeVotingQuestions(questions?: VotingQuestion[] | null) {
  const safeQuestions = questions ?? [];
  const normalized = safeQuestions
    .map((question) => ({
      ...question,
      id: question.id || "",
      text: question.text || "",
      options: getQuestionOptions(question),
    }))
    .filter((question) => question.text.trim());

  return normalized.length
    ? normalized
    : [{ id: "", text: "", options: DEFAULT_OPTIONS }];
}

function getQuestionOptions(question?: VotingQuestion | null) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.length ? options : DEFAULT_OPTIONS;
}

function findRevisionVoteWithComment(votes: VotingApprovalVote[]) {
  return (votes ?? []).find(
    (vote) => vote.decision === "revision" && vote.reason && vote.comment,
  );
}

function openVotingWizard(voting: Voting) {
  window.dispatchEvent(
    new CustomEvent("voting-constructor-navigation-confirmed", {
      detail: { component: "voting_constructor_create", initialVoting: voting },
    }),
  );
}

function confirmNavigation(component: string) {
  window.dispatchEvent(
    new CustomEvent("voting-constructor-navigation-confirmed", {
      detail: { component },
    }),
  );
}

function formatDate(value: string | Date) {
  return formatAstanaDateTime(value);
}

function formatMeetingDate(value: string | Date) {
  return formatAstanaDate(value);
}

type PublicationScheduleLimits = {
  meetingDate: Date;
  earliestStartDate: Date;
  latestStartDate: Date;
  finalDeadlineDate: Date;
  finalDeadlineEnd: Date;
  recommendedStart: Date;
  recommendedEnd: Date;
};

function getPublicationScheduleLimits(voting: Voting): PublicationScheduleLimits | null {
  if (!voting.meeting?.scheduled_at) return null;

  const meetingDate = startOfAstanaDay(voting.meeting.scheduled_at);
  if (!meetingDate) return null;

  const earliestStartDate = addAstanaDays(meetingDate, 1);
  const finalDeadlineDate = addAstanaMonths(meetingDate, 2);
  if (!earliestStartDate || !finalDeadlineDate) return null;

  const latestStartDate = addAstanaDays(finalDeadlineDate, -MIN_VOTING_DAYS);
  const recommendedStart = setAstanaTime(earliestStartDate, 9, 0);
  if (!latestStartDate || !recommendedStart) return null;

  const finalDeadlineEnd = endOfAstanaDay(finalDeadlineDate);
  const recommendedEnd = addAstanaDays(recommendedStart, MIN_VOTING_DAYS);
  if (!finalDeadlineEnd || !recommendedEnd) return null;

  return {
    meetingDate,
    earliestStartDate,
    latestStartDate,
    finalDeadlineDate,
    finalDeadlineEnd,
    recommendedStart,
    recommendedEnd,
  };
}

function getInitialPublicationStart(
  voting: Voting,
  limits: PublicationScheduleLimits | null,
) {
  const savedStart = parseServerDateTime(voting.publication_start_at);
  if (savedStart) return formatDateTimeLocal(savedStart);
  return limits ? formatDateTimeLocal(limits.recommendedStart) : "";
}

function getInitialPublicationEnd(
  voting: Voting,
  limits: PublicationScheduleLimits | null,
) {
  const savedEnd = parseServerDateTime(voting.publication_end_at);
  if (savedEnd) return formatDateTimeLocal(savedEnd);
  return limits ? formatDateTimeLocal(limits.recommendedEnd) : "";
}

function validatePublicationSchedule(
  limits: PublicationScheduleLimits | null,
  startValue: string,
  endValue: string,
) {
  if (!limits) {
    return "У опросника нет привязанного собрания.";
  }

  const startAt = parseDateTimeLocal(startValue);
  const endAt = parseDateTimeLocal(endValue);
  if (!startAt || !endAt) {
    return "Укажите дату и время начала и завершения голосования.";
  }

  if (startAt < limits.earliestStartDate) {
    return `Дата начала не может быть раньше ${formatMeetingDate(limits.earliestStartDate)}.`;
  }

  const latestStartEnd = endOfAstanaDay(limits.latestStartDate);
  if (!latestStartEnd) {
    return "Укажите дату и время начала и завершения голосования.";
  }

  if (startAt > latestStartEnd) {
    return "Нельзя выбрать эту дату начала: 7 дней голосования не помещаются в допустимый срок.";
  }

  const minimumEndAt = addAstanaDays(startAt, MIN_VOTING_DAYS);
  if (!minimumEndAt) {
    return "Укажите дату и время начала и завершения голосования.";
  }

  if (minimumEndAt > limits.finalDeadlineEnd) {
    return "Нельзя выбрать эту дату начала: 7 дней голосования не помещаются в допустимый срок.";
  }

  if (endAt < minimumEndAt) {
    return `Минимальная длительность голосования — ${MIN_VOTING_DAYS} дней.`;
  }

  if (endAt > limits.finalDeadlineEnd) {
    return `Дата завершения не может быть позже ${formatMeetingDate(limits.finalDeadlineDate)}.`;
  }

  return "";
}

function isPublicationSchedulingExpired(voting: Voting) {
  const limits = getPublicationScheduleLimits(voting);
  if (!limits) return false;
  if (
    voting.publication_status === "scheduled" ||
    voting.publication_status === "published"
  ) {
    return false;
  }

  const latestStartEnd = endOfAstanaDay(limits.latestStartDate);
  return latestStartEnd ? new Date() > latestStartEnd : false;
}

function parseDateTimeLocal(value: string) {
  return parseAstanaDateTimeLocal(value);
}

function parseServerDateTime(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTimeLocal(date: Date) {
  return formatAstanaDateTimeLocal(date);
}

function formatPayloadDateTime(date: Date) {
  return `${formatDateTimeLocal(date)}:00`;
}

function formatPublicationDateTime(date: Date) {
  return `${formatMeetingDate(date)} ${formatAstanaTime(date)}`;
}

function normalizeAgenda(agenda: unknown) {
  if (Array.isArray(agenda)) {
    return agenda
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof agenda === "string") {
    const trimmed = agenda.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return trimmed
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmed];
  }

  return [];
}
