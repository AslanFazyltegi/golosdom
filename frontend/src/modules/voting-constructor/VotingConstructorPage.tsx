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
  stopVoting,
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
import {
  AppPageHeader,
  VotingQuestionCard,
} from "@/shared/ui/design-system";
import type { Meeting } from "@/types/meeting";
import type {
  Voting,
  VotingApprovalReview,
  VotingApprovalVote,
  VotingCategory,
  VotingCouncilSubmitPayload,
  VotingDraftPayload,
  VotingPublicationSchedulePayload,
  VotingQuestion,
  VotingSavePayload,
} from "@/types/voting";

type WizardStep = 1 | 2 | 3;
type ConstructorStage = "category" | "wizard";
const DEFAULT_OPTIONS = ["Да", "Нет", "Воздержался"];
const DEFAULT_VOTING_CATEGORY: VotingCategory = "general";
const MIN_VOTING_DAYS = 7;

const VOTING_CATEGORY_OPTIONS: Array<{
  value: VotingCategory;
  label: string;
  description: string;
}> = [
  {
    value: "general",
    label: "Общий",
    description:
      "Вопросы общего характера касающиеся всех собственников кондоминиума. Данный опросник будет доступен всем собственникам (квартиры, НП, кладовые, паркоместа).",
  },
  {
    value: "apartments_and_commercial",
    label: "Квартиры и НП",
    description:
      "Вопросы на которые должны отвечать только собственники квартир и нежилых помещений. Данный опросник будет доступен только собственникам Квартиры и НП.",
  },
  {
    value: "parking_and_storerooms",
    label: "Паркоместа и кладовые",
    description:
      "Вопросы на которые должны отвечать только собственники парковочных мест и кладовых помещений. Данный опросник будет доступен только собственникам Паркомест и кладовых.",
  },
];

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
    return <VotingPublishedPage isChairman={isChairman} />;
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
  const [constructorStage, setConstructorStage] = useState<ConstructorStage>(
    initialVoting ? "wizard" : "category",
  );
  const [step, setStep] = useState<WizardStep>(1);
  const [votingID, setVotingID] = useState(initialVoting?.id || "");
  const [title] = useState(initialVoting?.title || "Опросный лист");
  const [description] = useState(initialVoting?.description || "");
  const [category, setCategory] = useState<VotingCategory | "">(
    initialVoting ? normalizeVotingCategory(initialVoting.category) : "",
  );
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
  const votingCategory = category || DEFAULT_VOTING_CATEGORY;

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
        setMeetings(await fetchMeetings("voting_constructor"));
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

  function updateCategory(value: VotingCategory) {
    if (hasQuestions || constructorStage === "wizard") {
      setDirty(true);
    }
    setCategory(value);
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
    return persistVoting(
      buildDraftPayload(title, description, votingCategory, meetingID, questions),
    );
  }

  async function saveForCouncilSubmit() {
    return persistVoting(
      buildCouncilSubmitPayload(title, description, votingCategory, meetingID, questions),
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
      <AppPageHeader
        title="Создать опросник"
        kicker="Конструктор голосования"
        description="Соберите вопросы, выберите собрание и проверьте опросный лист перед отправкой."
      />

      {constructorStage === "category" ? (
        <section className="gd-panel">
          <VotingCategoryStep category={category} setCategory={updateCategory} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => setConstructorStage("wizard")}
              disabled={!category}
            >
              Далее
            </Button>
          </div>
        </section>
      ) : (
        <section className="gd-panel">
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
              category={votingCategory}
              questions={filledQuestions}
              meeting={selectedMeeting}
            />
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {step === 1 && !initialVoting && (
              <Button onClick={() => setConstructorStage("category")}>Назад</Button>
            )}
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
      )}

      <SaveDraftModal
        open={saveModalOpen}
        saving={saving}
        onDiscard={discardAndLeave}
        onSave={saveAndLeave}
      />
    </>
  );
}

function VotingCategoryStep({
  category,
  setCategory,
}: {
  category: VotingCategory | "";
  setCategory: (value: VotingCategory) => void;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Выберите категорию опросника
        </h2>
      </div>

      <div className="grid gap-3" role="radiogroup" aria-label="Категория опросника">
        {VOTING_CATEGORY_OPTIONS.map((option) => {
          const selected = category === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setCategory(option.value)}
              className={`rounded-lg border p-5 text-left transition ${
                selected
                  ? "border-violet-500 bg-violet-50 text-violet-950"
                  : "border-slate-200 bg-white text-slate-800 hover:border-violet-300"
              }`}
            >
              <span className="flex items-start gap-3">
                <span
                  className={`mt-1 h-4 w-4 rounded-full border ${
                    selected ? "border-violet-600 bg-violet-600" : "border-slate-300"
                  }`}
                  aria-hidden="true"
                />
                <span className="grid gap-1">
                  <span className="font-semibold">{option.label}</span>
                  <span className="text-sm leading-6 text-slate-600">
                    {option.description}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
      <div className="gd-card">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Вопросы для голосования
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Добавьте вопросы, которые будут включены в опросный лист.
            </p>
          </div>
          <div className="gd-status-pill gd-status-violet">
            Всего вопросов:{" "}
            {questions.filter((question) => (question.text ?? "").trim()).length}
          </div>
        </div>

        <div className="grid gap-4">
          {questions.map((question, index) => (
            <div key={index} className="gd-voting-question-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="gd-voting-question-number">{index + 1}</span>
                  <h3 className="font-bold text-[var(--gd-text-strong)]">
                    Вопрос {index + 1}
                  </h3>
                </div>
                <Button
                  onClick={() =>
                    setQuestions(questions.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Удалить
                </Button>
              </div>
              <textarea
                className="gd-input min-h-32 text-[17px] leading-[1.65]"
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
          Нет собраний, доступных для создания опросного листа
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
  category,
  questions,
  meeting,
}: {
  title: string;
  description: string;
  category: VotingCategory;
  questions: VotingQuestion[];
  meeting?: Meeting | NonNullable<Voting["meeting"]> | null;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Категория опросника: {getVotingCategoryLabel(category)}
        </p>
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

function VotingPublishedPage({ isChairman }: { isChairman: boolean }) {
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setLoading(true);
      const items = await fetchVotings("published");
      setVotings(Array.isArray(items) ? items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить опубликованные опросники");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetchVotings("published")
      .then((items) => {
        if (!active) return;
        setVotings(Array.isArray(items) ? items : []);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Не удалось загрузить опубликованные опросники");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Опубликованные</h1>
        <Button onClick={load}>Обновить</Button>
      </div>
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p>Загрузка...</p>
      ) : votings.length === 0 ? (
        <Placeholder title="" text="Опубликованных опросных листов пока нет." />
      ) : (
        <div className="grid gap-4">
          {votings.map((voting) => (
            <PublishedVotingCard
              key={voting.id}
              voting={voting}
              isChairman={isChairman}
              reload={load}
            />
          ))}
        </div>
      )}
    </>
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
          <p className="text-sm text-slate-500">
            Категория: {getVotingCategoryLabel(voting.category)}
          </p>
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

function PublishedVotingCard({
  voting,
  isChairman,
  reload,
}: {
  voting: Voting;
  isChairman: boolean;
  reload: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [stopReason, setStopReason] = useState("");
  const [stopReasonError, setStopReasonError] = useState("");
  const stopState = getVotingStopState(voting);
  const questions = voting.questions ?? [];
  const publishedAt = voting.published_at ?? voting.publication_start_at;

  async function confirmStop() {
    const reason = stopReason.trim();
    if (!reason) {
      setStopReasonError("Укажите причину остановки голосования.");
      return;
    }

    try {
      setStopping(true);
      setError("");
      setStopReasonError("");
      await stopVoting(voting.id, { reason });
      setConfirmOpen(false);
      setStopReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось остановить голосование");
    } finally {
      setStopping(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{voting.title}</h2>
          <p className="text-sm text-slate-500">Версия {voting.version || 1}</p>
          <p className="text-sm text-slate-500">
            Категория: {getVotingCategoryLabel(voting.category)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Свернуть" : "Развернуть"}
          </Button>
          {isChairman && voting.status === "published" && stopState.showButton && (
            <Button
              variant="primary"
              onClick={() => setConfirmOpen(true)}
              disabled={!stopState.canStop || stopping}
            >
              Остановить голосование
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-md bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
        <p>Дата собрания: {voting.meeting ? formatMeetingDate(voting.meeting.scheduled_at) : "Не указана"}</p>
        <p>Дата публикации: {publishedAt ? formatDate(publishedAt) : "Не указана"}</p>
        <p>Крайний срок завершения: {voting.publication_end_at ? formatDate(voting.publication_end_at) : "Не указан"}</p>
        <p>Статус: {getVotingStatusLabel(voting.status)}</p>
        <p>Вопросов: {questions.length}</p>
        <p>
          Проголосовали: {formatVotingProgress(voting)}
        </p>
      </div>

      {isChairman && stopState.message && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {stopState.message}
        </p>
      )}
      {voting.status !== "published" && getVotingCompletionReason(voting) && (
        <p className="mb-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          Причина завершения: {getVotingCompletionReason(voting)}
        </p>
      )}
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {expanded && (
        <div className="grid gap-4">
          {voting.meeting && <MeetingInfo meeting={voting.meeting} />}
          <QuestionList questions={questions} />
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-700">
            <p>Создано: {voting.created_at ? formatDate(voting.created_at) : "Не указано"}</p>
            <p>Обновлено: {voting.updated_at ? formatDate(voting.updated_at) : "Не указано"}</p>
            <p>Минимальная дата остановки: {stopState.minStopAt ? formatDate(stopState.minStopAt) : "Не указана"}</p>
            {voting.stopped_at && <p>Остановлено: {formatDate(voting.stopped_at)}</p>}
            {voting.completed_at && <p>Завершено: {formatDate(voting.completed_at)}</p>}
          </div>
        </div>
      )}

      {confirmOpen && (
        <ConfirmStopModal
          submitting={stopping}
          reason={stopReason}
          reasonError={stopReasonError}
          onReasonChange={(value) => {
            setStopReason(value);
            if (stopReasonError) setStopReasonError("");
          }}
          onCancel={() => {
            setConfirmOpen(false);
            setStopReason("");
            setStopReasonError("");
          }}
          onConfirm={confirmStop}
        />
      )}
    </section>
  );
}

function ConfirmStopModal({
  submitting,
  reason,
  reasonError,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  submitting: boolean;
  reason: string;
  reasonError: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-3 text-xl font-semibold">Остановить голосование?</h2>
        <p className="text-slate-600">
          Вы уверены, что хотите остановить голосование? После остановки собственники больше не смогут голосовать.
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="stop-reason">
          Причина остановки
        </label>
        <textarea
          id="stop-reason"
          className="mt-2 min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          disabled={submitting}
        />
        {reasonError && <p className="mt-2 text-sm text-red-600">{reasonError}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onCancel} disabled={submitting}>
            Отмена
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={submitting}>
            Остановить голосование
          </Button>
        </div>
      </div>
    </div>
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
            <p>Уведомление: будет создано при открытии голосования</p>
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
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const publicationMinDateTime = getTodayDateTimeMinValue();

  async function submit() {
    const validationError = validatePublicationSchedule(limits, startAt);
    if (validationError) {
      setError(validationError);
      return;
    }

    const startDate = parseDateTimeLocal(startAt);
    if (!startDate) {
      setError("Укажите дату и время начала голосования.");
      return;
    }

    const payload: VotingPublicationSchedulePayload = {
      start_at: formatPayloadDateTime(startDate),
      send_notifications: true,
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
              min={publicationMinDateTime}
              className="rounded-md border p-2"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              disabled={!limits || submitting}
            />
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
        <VotingQuestionCard
          key={`${question.id}-${index}`}
          number={index + 1}
          text={question.text ?? ""}
          mode="preview"
        />
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
      className={`gd-button ${
        variant === "primary"
          ? "gd-button-primary"
          : ""
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
  category: VotingCategory,
  meetingID: string,
  questions: VotingQuestion[],
): VotingDraftPayload {
  return {
    title,
    description,
    category,
    meeting_id: meetingID || null,
    questions: buildQuestionPayload(questions),
  };
}

function buildCouncilSubmitPayload(
  title: string,
  description: string,
  category: VotingCategory,
  meetingID: string,
  questions: VotingQuestion[],
): VotingCouncilSubmitPayload {
  return {
    ...buildDraftPayload(title, description, category, meetingID, questions),
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

function normalizeVotingCategory(category?: string | null): VotingCategory {
  return VOTING_CATEGORY_OPTIONS.some((option) => option.value === category)
    ? (category as VotingCategory)
    : DEFAULT_VOTING_CATEGORY;
}

function getVotingCategoryLabel(category?: string | null) {
  return (
    VOTING_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ??
    VOTING_CATEGORY_OPTIONS[0].label
  );
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

function validatePublicationSchedule(
  limits: PublicationScheduleLimits | null,
  startValue: string,
) {
  if (!limits) {
    return "У опросника нет привязанного собрания.";
  }

  const startAt = parseDateTimeLocal(startValue);
  if (!startAt) {
    return "Укажите дату и время начала голосования.";
  }

  if (startAt < limits.earliestStartDate) {
    return `Дата начала не может быть раньше ${formatMeetingDate(limits.earliestStartDate)}.`;
  }

  const latestStartEnd = endOfAstanaDay(limits.latestStartDate);
  if (!latestStartEnd) {
    return "Укажите дату и время начала и завершения голосования.";
  }

  if (startAt > latestStartEnd) {
    return "Нельзя запланировать публикацию на эту дату: голосование должно длиться не менее 7 дней и завершиться не позднее 2 месяцев с даты собрания.";
  }

  const minimumEndAt = addAstanaDays(startAt, MIN_VOTING_DAYS);
  if (!minimumEndAt) {
    return "Укажите дату и время начала и завершения голосования.";
  }

  if (minimumEndAt > limits.finalDeadlineEnd) {
    return "Нельзя запланировать публикацию на эту дату: голосование должно длиться не менее 7 дней и завершиться не позднее 2 месяцев с даты собрания.";
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

function getVotingStopState(voting: Voting) {
  const status = voting.status;
  const startAt = parseServerDateTime(voting.published_at ?? voting.publication_start_at);
  const minStopAt =
    parseServerDateTime(voting.stop_available_at) ??
    (startAt ? addAstanaDays(startAt, MIN_VOTING_DAYS) : null);

  if (status === "stopped") {
    return { showButton: true, canStop: false, minStopAt, message: "" };
  }

  if (status !== "published") {
    return { showButton: false, canStop: false, minStopAt, message: "" };
  }

  if (!minStopAt) {
    return {
      showButton: true,
      canStop: false,
      minStopAt,
      message: voting.stop_block_reason || "Для остановки голосования не хватает даты публикации.",
    };
  }

  if (!voting.can_stop) {
    return {
      showButton: true,
      canStop: false,
      minStopAt,
      message:
        voting.stop_block_reason ||
        "Остановить можно после минимального срока голосования — 7 дней.",
    };
  }

  return { showButton: true, canStop: true, minStopAt, message: "" };
}

function formatVotingProgress(voting: Voting) {
  const totalOwners = voting.total_owners_count;
  const votedOwners = voting.voted_owners_count;
  if (typeof totalOwners !== "number" || totalOwners <= 0) return "Нет данных";
  return `${votedOwners ?? 0} / ${totalOwners}`;
}

function getVotingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Черновик",
    council_review: "На утверждении у совета дома",
    revision_required: "На доработке",
    pending_publish: "Ожидает публикации",
    published: "Идет голосование",
    active: "Идет голосование",
    stopped: "Остановлено",
    completed: "Завершено",
    expired: "Завершено",
  };
  return labels[status] || status;
}

function getVotingCompletionReason(voting: Voting) {
  if (voting.completion_reason) return voting.completion_reason;
  if (voting.completion_type === "deadline_expired" || voting.status === "completed" || voting.status === "expired") {
    return "Истёк установленный законодательством срок для сбора голосов.";
  }
  if (voting.completion_type === "manual_stop" || voting.status === "stopped") {
    return "Остановлено председателем";
  }
  return "";
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

function getTodayDateTimeMinValue() {
  return `${getTodayDateValue()}T00:00`;
}

function getTodayDateValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
