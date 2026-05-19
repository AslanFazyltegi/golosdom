"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchMeetings } from "@/lib/meetings";
import {
  createVotingDraft,
  deleteVoting,
  fetchVotingApproval,
  fetchVotings,
  resubmitVotingToCouncil,
  submitApprovalVote,
  submitVotingToCouncil,
  updateVotingDraft,
} from "@/lib/votings";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";
import type { Meeting } from "@/types/meeting";
import type {
  Voting,
  VotingApprovalReview,
  VotingApprovalVote,
  VotingCouncilSubmitPayload,
  VotingDraftPayload,
  VotingQuestion,
  VotingSavePayload,
} from "@/types/voting";

type WizardStep = 1 | 2 | 3;
const DEFAULT_OPTIONS = ["Да", "Нет", "Воздержался"];

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
    return <VotingPendingPublishPage />;
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

function VotingPendingPublishPage() {
  return (
    <VotingStatusPage
      title="Ожидающие публикации"
      status="pending_publish"
      emptyText="Нет опросных листов, ожидающих публикации."
      actions={() => <Button disabled>Опубликовать позже</Button>}
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
}: {
  title: string;
  status: string;
  emptyText?: string;
  actions?: (voting: Voting, reload: () => Promise<void>) => ReactNode;
  showApproval?: boolean;
  showRevisionDetails?: boolean;
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
  refreshToken,
}: {
  voting: Voting;
  children?: ReactNode;
  showApproval?: boolean;
  showRevisionDetails?: boolean;
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
  showVotes = true,
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

  const approvalVotes = approval.votes ?? [];
  const revisionVote = showRevisionSummary
    ? findRevisionVoteWithComment(approvalVotes)
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
        {revisionVote?.reason && (
          <p>Причина доработки: {reasonLabels[revisionVote.reason] || revisionVote.reason}</p>
        )}
        {revisionVote?.comment && <p>Комментарий: {revisionVote.comment}</p>}
        <p>Не проголосовали: {approval.pending_council_members}</p>
        {approval.no_majority_reason && (
          <p className="text-amber-700">{approval.no_majority_reason}</p>
        )}
      </div>

      {showVotes && approvalVotes.length > 0 && (
        <div className="mt-3 grid gap-2 text-sm">
          {approvalVotes.map((vote) => (
            <div key={vote.id} className="rounded-md border bg-white p-3">
              <p>{vote.decision === "approve" ? "Утвердить" : "На доработку"}</p>
              {vote.reason && <p>Причина: {reasonLabels[vote.reason] || vote.reason}</p>}
              {vote.comment && <p>Комментарий: {vote.comment}</p>}
            </div>
          ))}
        </div>
      )}
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
  return new Date(value).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMeetingDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
