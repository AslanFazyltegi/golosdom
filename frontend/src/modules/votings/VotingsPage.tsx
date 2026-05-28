"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import {
  downloadVotingBlank,
  fetchActiveVotings,
  fetchCompletedVotings,
  fetchMyVotingAnswers,
  fetchVotingDetails,
  fetchVotingResults,
  submitOwnerVoteBatch,
  submitOwnerVote,
} from "@/lib/votings";
import { formatAstanaDate, formatAstanaDateTime } from "@/shared/lib/dateTime";
import type {
  OwnerVotingAnswer,
  Voting,
  VotingAnswerValue,
  VotingCategory,
  VotingResult,
  VotingSignatureMock,
} from "@/types/voting";
import type { PropertyObject } from "@/types/objects";

type VotingMode = "active" | "completed";
type WizardStep = "answers" | "review";

type VotingSelectionState = {
  current: Voting;
  available: Voting[];
  completed: Voting[];
};

const answerLabels: Record<VotingAnswerValue, string> = {
  for: "За",
  against: "Против",
  abstain: "Воздержусь",
};

const signatureMethodLabels: Record<string, string> = {
  MOCK_MGOV: "mGov",
  MOCK_ECP: "ЭЦП",
};

const APARTMENT_AND_COMMERCIAL_TYPES = new Set(["apartment", "commercial_room"]);
const PARKING_AND_STOREROOM_TYPES = new Set(["parking", "storage"]);

const VOTING_SECTIONS: Array<{
  category: VotingCategory;
  title: string;
}> = [
  {
    category: "general",
    title: "Общие голосования",
  },
  {
    category: "apartments_and_commercial",
    title: "Голосования по квартирам и нежилым помещениям",
  },
  {
    category: "parking_and_storerooms",
    title: "Голосования по кладовым и паркоместам",
  },
];

export function VotingsPage(props: CabinetModuleProps) {
  if (props.activeRole !== "OWNER") {
    return <OwnerOnly title="Активные голосования" />;
  }

  return (
    <OwnerVotingsList
      title="Активные голосования"
      mode="active"
      emptyText="Нет активных голосований."
      objects={props.objects}
      onReloadLayout={props.loadVotings}
    />
  );
}

export function PastVotingsPage(props: CabinetModuleProps) {
  if (props.activeRole !== "OWNER") {
    return <OwnerOnly title="Прошедшие голосования" />;
  }

  return (
    <OwnerVotingsList
      title="Прошедшие голосования"
      mode="completed"
      emptyText="Прошедших голосований пока нет."
      objects={props.objects}
      onReloadLayout={props.loadVotings}
    />
  );
}

function OwnerOnly({ title }: { title: string }) {
  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">{title}</h1>
      <div className="rounded-lg border bg-white p-5 text-sm text-slate-600 shadow-sm">
        Раздел онлайн-голосования доступен только роли OWNER.
      </div>
    </>
  );
}

function OwnerVotingsList({
  title,
  mode,
  emptyText,
  objects,
  onReloadLayout,
}: {
  title: string;
  mode: VotingMode;
  emptyText: string;
  objects: unknown;
  onReloadLayout: () => void;
}) {
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [wizardVotings, setWizardVotings] = useState<Voting[]>([]);
  const [selectionState, setSelectionState] = useState<VotingSelectionState | null>(null);
  const [answersVoting, setAnswersVoting] = useState<Voting | null>(null);
  const [openingVotingId, setOpeningVotingId] = useState("");
  const reloadLayoutRef = useRef(onReloadLayout);

  useEffect(() => {
    reloadLayoutRef.current = onReloadLayout;
  }, [onReloadLayout]);

  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const items = mode === "active" ? await fetchActiveVotings() : await fetchCompletedVotings();
      setVotings(Array.isArray(items) ? items : []);
      setRefreshToken((current) => current + 1);
      reloadLayoutRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить голосования");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const votingSections = useMemo(
    () => buildOwnerVotingSections(votings, objects),
    [objects, votings],
  );

  async function startOnlineVoting(voting: Voting) {
    try {
      setError("");
      setSuccess("");
      setOpeningVotingId(voting.id);
      const details = await fetchVotingDetails(voting.id);
      if (details.user_has_voted) {
        setSuccess("Вы уже проголосовали по данному опроснику.");
        await load();
        return;
      }
      if (!isVotingCurrentlyActive(details)) {
        setError("Опросник уже недоступен. Список активных голосований обновлен.");
        await load();
        return;
      }

      const meetingID = details.meeting_id || details.meeting?.id || "";
      if (!meetingID) {
        setWizardVotings([details]);
        return;
      }

      const sameMeeting = votings.filter((item) => (item.meeting_id || item.meeting?.id) === meetingID);
      const available = sortVotingsForWizard(
        sameMeeting
          .filter((item) => !item.user_has_voted)
          .filter((item) => isVotingCurrentlyActive(item))
          .filter((item) => isVotingCategoryAvailableForOwner(getVotingCategory(item), objects))
          .map((item) => (item.id === details.id ? details : item)),
      );
      const completed = sortVotingsForWizard(sameMeeting.filter((item) => item.user_has_voted));

      if (available.length <= 1) {
        setWizardVotings([details]);
        return;
      }

      setSelectionState({
        current: details,
        available,
        completed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть голосование");
    } finally {
      setOpeningVotingId("");
    }
  }

  async function handleVoteSuccess() {
    setWizardVotings([]);
    setSuccess("Ваш голос успешно принят и подписан.");
    await load();
  }

  async function openSelectedVotings(votingIDs: string[]) {
    try {
      setError("");
      setSuccess("");
      const details = await Promise.all(votingIDs.map((id) => fetchVotingDetails(id)));
      const unavailable = details.filter((item) => item.user_has_voted || !isVotingCurrentlyActive(item));
      if (unavailable.length > 0) {
        setSelectionState(null);
        setError("Часть опросников уже недоступна. Список активных голосований обновлен.");
        await load();
        return;
      }
      setSelectionState(null);
      setWizardVotings(sortVotingsForWizard(details));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть выбранные опросники");
    }
  }

  async function openCurrentVotingOnly(voting: Voting) {
    const hasOtherAvailable = Boolean(
      selectionState?.available.some((item) => item.id !== voting.id),
    );
    if (
      hasOtherAvailable &&
      !window.confirm(
        "Вы выбрали прохождение только одного опросного листа. По этому же собранию у вас есть ещё доступные опросники. Их можно будет пройти отдельно позже.",
      )
    ) {
      return;
    }
    await openSelectedVotings([voting.id]);
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{title}</h1>
        <button
          type="button"
          onClick={load}
          className="rounded-md border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Обновить
        </button>
      </div>

      {success && (
        <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>
      )}
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Загрузка...</p>
      ) : votingSections.length === 0 ? (
        <div className="rounded-lg border bg-white p-5 text-slate-500 shadow-sm">{emptyText}</div>
      ) : (
        <div className="grid gap-8">
          {votingSections.map((section) => (
            <section key={section.category}>
              <h2 className="mb-4 text-xl font-semibold text-slate-900">{section.title}</h2>
              <div className="grid gap-4">
                {section.votings.map((voting) => (
                  <OwnerVotingCard
                    key={voting.id}
                    voting={voting}
                    mode={mode}
                    refreshToken={refreshToken}
                    opening={openingVotingId === voting.id}
                    onStartVoting={() => startOnlineVoting(voting)}
                    onViewAnswers={() => setAnswersVoting(voting)}
                    onError={setError}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectionState && (
        <VotingSelectionModal
          state={selectionState}
          objects={objects}
          onClose={() => setSelectionState(null)}
          onStartSelected={openSelectedVotings}
          onStartCurrentOnly={openCurrentVotingOnly}
        />
      )}

      {wizardVotings.length > 0 && (
        <VotingWizard
          votings={wizardVotings}
          onClose={() => setWizardVotings([])}
          onSuccess={handleVoteSuccess}
        />
      )}

      {answersVoting && (
        <MyAnswersModal
          voting={answersVoting}
          onClose={() => setAnswersVoting(null)}
        />
      )}
    </>
  );
}

function buildOwnerVotingSections(votings: Voting[], objects: unknown) {
  return VOTING_SECTIONS.map((section) => {
    const seenVotingIDs = new Set<string>();
    const sectionVotings = votings.filter((voting) => {
      if (getVotingCategory(voting) !== section.category) return false;
      if (!isVotingCategoryAvailableForOwner(section.category, objects)) return false;
      if (seenVotingIDs.has(voting.id)) return false;

      seenVotingIDs.add(voting.id);
      return true;
    });

    return {
      ...section,
      votings: sectionVotings,
    };
  }).filter((section) => section.votings.length > 0);
}

function getVotingCategory(voting: Voting): VotingCategory {
  return VOTING_SECTIONS.some((section) => section.category === voting.category)
    ? (voting.category as VotingCategory)
    : "general";
}

function getVotingCategoryLabel(category: VotingCategory) {
  const labels: Record<VotingCategory, string> = {
    general: "Общий опросный лист",
    apartments_and_commercial: "Опросный лист для квартир и нежилых помещений",
    parking_and_storerooms: "Опросный лист для кладовых и паркомест",
  };
  return labels[category] || "Опросный лист";
}

function isVotingCurrentlyActive(voting: Voting) {
  const now = Date.now();
  const startsAt = voting.publication_start_at ? Date.parse(voting.publication_start_at) : Number.NaN;
  const endsAt = voting.publication_end_at ? Date.parse(voting.publication_end_at) : Number.NaN;

  return (
    voting.status === "published" &&
    voting.publication_status === "published" &&
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now &&
    endsAt >= now &&
    !voting.stopped_at
  );
}

function sortVotingsForWizard(items: Voting[]) {
  const categoryOrder: Record<VotingCategory, number> = {
    general: 0,
    apartments_and_commercial: 1,
    parking_and_storerooms: 2,
  };
  return [...items].sort((left, right) => {
    const categoryDiff =
      (categoryOrder[getVotingCategory(left)] ?? 99) - (categoryOrder[getVotingCategory(right)] ?? 99);
    if (categoryDiff !== 0) return categoryDiff;
    return String(left.created_at || left.id).localeCompare(String(right.created_at || right.id));
  });
}

function isVotingCategoryAvailableForOwner(category: VotingCategory, objects: unknown) {
  if (category === "general") return true;
  if (category === "apartments_and_commercial") {
    return hasAnyOwnerPropertyType(objects, APARTMENT_AND_COMMERCIAL_TYPES);
  }
  if (category === "parking_and_storerooms") {
    return hasAnyOwnerPropertyType(objects, PARKING_AND_STOREROOM_TYPES);
  }

  return false;
}

function buildOwnerPropertyLabels(objects: unknown) {
  if (!Array.isArray(objects)) return [];

  return (objects as PropertyObject[])
    .filter((item) => item.status === "active")
    .map((item) => `${propertyTypeLabel(item.property_type)} №${item.number}`)
    .filter(Boolean);
}

function propertyTypeLabel(type: string) {
  const labels: Record<string, string> = {
    apartment: "Квартира",
    commercial_room: "Нежилое помещение",
    parking: "Паркоместо",
    storage: "Кладовая",
  };
  return labels[String(type || "").trim().toLowerCase()] || "Имущество";
}

function hasAnyOwnerPropertyType(objects: unknown, allowedTypes: Set<string>) {
  if (!Array.isArray(objects)) return false;

  return (objects as PropertyObject[]).some((item) =>
    allowedTypes.has(String(item.property_type || "").trim().toLowerCase()),
  );
}

function OwnerVotingCard({
  voting,
  mode,
  refreshToken,
  opening,
  onStartVoting,
  onViewAnswers,
  onError,
}: {
  voting: Voting;
  mode: VotingMode;
  refreshToken: number;
  opening: boolean;
  onStartVoting: () => void;
  onViewAnswers: () => void;
  onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<VotingResult[]>([]);
  const [resultsError, setResultsError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const hasVoted = Boolean(voting.user_has_voted);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setResultsError("");
      fetchVotingResults(voting.id)
        .then((items) => {
          if (active) setResults(Array.isArray(items) ? items : []);
        })
        .catch((err) => {
          if (active) {
            setResultsError(err instanceof Error ? err.message : "Не удалось загрузить результаты");
          }
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [voting.id, refreshToken]);

  async function downloadBlank() {
    try {
      setDownloading(true);
      onError("");
      await downloadVotingBlank(voting.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось скачать бланк");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{voting.title || "Опросный лист"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {voting.meeting
              ? `Собрание: ${formatAstanaDate(voting.meeting.scheduled_at)}`
              : "Собрание не указано"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={mode === "active" ? statusBadgeClass("blue") : statusBadgeClass("slate")}>
            {mode === "active" ? "Идет голосование" : getVotingStatusLabel(voting.status)}
          </span>
          {hasVoted && (
            <span className={statusBadgeClass("emerald")}>Вы проголосовали</span>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-md bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
        <p>Дата собрания: {voting.meeting ? formatAstanaDateTime(voting.meeting.scheduled_at) : "Не указана"}</p>
        <p>Крайний срок голосования: {voting.publication_end_at ? formatAstanaDateTime(voting.publication_end_at) : "Не указан"}</p>
        {mode === "completed" && (
          <>
            <p>Дата завершения: {formatCompletionDate(voting)}</p>
            <p>Причина завершения: {getCompletionReason(voting)}</p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mb-4 text-sm font-medium text-blue-700 hover:text-blue-800"
      >
        {expanded ? "Свернуть" : "Развернуть"}
      </button>

      {expanded && (
        <VotingResultsBlock results={results} error={resultsError} />
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {mode === "active" && !hasVoted && (
          <>
            <Button variant="primary" onClick={onStartVoting} disabled={opening}>
              {opening ? "Открываем..." : "Пройти голосование онлайн"}
            </Button>
            <Button onClick={downloadBlank} disabled={downloading}>
              {downloading ? "Скачиваем..." : "Скачать бланк опросника"}
            </Button>
          </>
        )}
        {hasVoted && (mode !== "completed" || expanded) && (
          <Button onClick={onViewAnswers}>Посмотреть мои ответы</Button>
        )}
      </div>
    </article>
  );
}

function VotingResultsBlock({ results, error }: { results: VotingResult[]; error: string }) {
  if (error) {
    return <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{error}</p>;
  }

  if (results.length === 0) {
    return <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Результатов пока нет.</p>;
  }

  return (
    <div className="grid gap-3">
      {results.map((result, index) => (
        <div key={result.question_id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium">
            Вопрос {index + 1}: {result.question_text}
          </p>
          <p className="mt-1">
            За: {result.for_count} / Против: {result.against_count} / Воздержались:{" "}
            {result.abstain_count}
          </p>
        </div>
      ))}
    </div>
  );
}

function VotingSelectionModal({
  state,
  objects,
  onClose,
  onStartSelected,
  onStartCurrentOnly,
}: {
  state: VotingSelectionState;
  objects: unknown;
  onClose: () => void;
  onStartSelected: (votingIDs: string[]) => Promise<void>;
  onStartCurrentOnly: (voting: Voting) => Promise<void>;
}) {
  const [selectedIDs, setSelectedIDs] = useState(() => new Set(state.available.map((item) => item.id)));
  const [opening, setOpening] = useState(false);
  const propertyLabels = buildOwnerPropertyLabels(objects);

  function toggleVoting(voting: Voting) {
    if (voting.id === state.current.id) return;
    setSelectedIDs((current) => {
      const next = new Set(current);
      if (next.has(voting.id)) {
        next.delete(voting.id);
      } else {
        next.add(voting.id);
      }
      next.add(state.current.id);
      return next;
    });
  }

  async function startSelected() {
    setOpening(true);
    await onStartSelected(state.available.filter((item) => selectedIDs.has(item.id)).map((item) => item.id));
    setOpening(false);
  }

  async function startCurrentOnly() {
    setOpening(true);
    await onStartCurrentOnly(state.current);
    setOpening(false);
  }

  return (
    <ModalFrame title="По этому собранию доступны несколько опросных листов" onClose={onClose}>
      <div className="mb-5 grid gap-3 text-sm text-slate-700">
        {propertyLabels.length > 0 && (
          <div>
            <p className="font-medium text-slate-900">Вы владеете следующим имуществом:</p>
            <p>{propertyLabels.join(", ")}</p>
          </div>
        )}
        <p>
          К этому же собранию доступны несколько опросных листов. Вы можете пройти их разом
          и подписать в конце одной операцией.
        </p>
      </div>

      <div className="grid gap-2">
        {state.available.map((voting) => {
          const isCurrent = voting.id === state.current.id;
          return (
            <label
              key={voting.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border bg-white p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={selectedIDs.has(voting.id)}
                disabled={isCurrent || opening}
                onChange={() => toggleVoting(voting)}
              />
              <span>
                <span className="block font-medium text-slate-900">
                  {getVotingCategoryLabel(getVotingCategory(voting))}
                  {isCurrent ? " (текущий)" : ""}
                </span>
                <span className="block text-slate-500">{voting.title || "Опросный лист"}</span>
              </span>
            </label>
          );
        })}
        {state.completed.map((voting) => (
          <div key={voting.id} className="rounded-md border bg-slate-50 p-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">
              {getVotingCategoryLabel(getVotingCategory(voting))}
            </span>{" "}
            — уже пройден
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button onClick={onClose} disabled={opening}>Отмена</Button>
        <Button onClick={startCurrentOnly} disabled={opening}>
          Пройти только текущий опросник
        </Button>
        <Button variant="primary" onClick={startSelected} disabled={opening}>
          {opening ? "Открываем..." : "Пройти выбранные разом"}
        </Button>
      </div>
    </ModalFrame>
  );
}

function VotingWizard({
  votings,
  onClose,
  onSuccess,
}: {
  votings: Voting[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const activeVoting = votings[0];
  const [votingIndex, setVotingIndex] = useState(0);
  const voting = votings[votingIndex] || activeVoting;
  const questions = voting.questions ?? [];
  const [step, setStep] = useState<WizardStep>("answers");
  const [answers, setAnswers] = useState<Record<string, Record<string, VotingAnswerValue>>>({});
  const [signatureMethod, setSignatureMethod] = useState<VotingSignatureMock>("MOCK_MGOV");
  const [error, setError] = useState("");
  const [missingQuestionID, setMissingQuestionID] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validateAnswers(targetVoting = voting) {
    const targetQuestions = targetVoting.questions ?? [];
    const votingAnswers = answers[targetVoting.id] || {};
    const missingIndex = targetQuestions.findIndex((question) => !votingAnswers[question.id]);
    if (missingIndex >= 0) {
      setMissingQuestionID(targetQuestions[missingIndex].id);
      setError(`Ответьте на вопрос №${missingIndex + 1}`);
      return false;
    }
    setMissingQuestionID("");
    setError("");
    return true;
  }

  function goNext() {
    if (!validateAnswers()) return;
    if (votingIndex < votings.length - 1) {
      setVotingIndex((current) => current + 1);
      return;
    }
    setStep("review");
  }

  function goBack() {
    setError("");
    setMissingQuestionID("");
    if (step === "review") {
      setStep("answers");
      setVotingIndex(votings.length - 1);
      return;
    }
    if (votingIndex > 0) {
      setVotingIndex((current) => current - 1);
    }
  }

  async function signAndSubmit() {
    const invalidIndex = votings.findIndex((item) => !validateAnswers(item));
    if (invalidIndex >= 0) {
      setVotingIndex(invalidIndex);
      setStep("answers");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      if (votings.length === 1) {
        await submitOwnerVote(voting.id, {
          signature_method: signatureMethod,
          answers: questions.map((question) => ({
            question_id: question.id,
            answer: answers[voting.id]?.[question.id] as VotingAnswerValue,
          })),
        });
      } else {
        const meetingID = voting.meeting_id || voting.meeting?.id || "";
        await submitOwnerVoteBatch({
          meeting_id: meetingID,
          voting_ids: votings.map((item) => item.id),
          signature_method: signatureMethod,
          answers: votings.map((item) => ({
            voting_id: item.id,
            answers: (item.questions ?? []).map((question) => ({
              question_id: question.id,
              answer: answers[item.id]?.[question.id] as VotingAnswerValue,
            })),
          })),
        });
      }
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить голос");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalFrame title="Пройти голосование онлайн" onClose={onClose}>
      <div className="mb-5 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
        <p className="mb-2 font-medium text-blue-700">
          {step === "review"
            ? "Проверка ответов"
            : `Опросник ${votingIndex + 1} из ${votings.length}`}
        </p>
        <h3 className="text-lg font-semibold text-slate-900">{voting.title || "Опросный лист"}</h3>
        <p>Категория: {getVotingCategoryLabel(getVotingCategory(voting))}</p>
        <p>Дата собрания: {voting.meeting ? formatAstanaDateTime(voting.meeting.scheduled_at) : "Не указана"}</p>
        <p>Крайний срок голосования: {voting.publication_end_at ? formatAstanaDateTime(voting.publication_end_at) : "Не указан"}</p>
      </div>

      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {step === "answers" ? (
        <>
          <div className="grid gap-4">
            {questions.map((question, index) => (
              <fieldset
                key={question.id}
                className={`rounded-md border p-4 ${
                  missingQuestionID === question.id ? "border-red-300 bg-red-50/40" : ""
                }`}
              >
                <legend className="mb-3 font-medium">
                  {index + 1}. {question.text}
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["for", "against", "abstain"] as VotingAnswerValue[]).map((answerValue) => (
                    <label
                      key={answerValue}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={answerValue}
                        checked={answers[voting.id]?.[question.id] === answerValue}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [voting.id]: {
                              ...(current[voting.id] || {}),
                              [question.id]: answerValue,
                            },
                          }))
                        }
                      />
                      <span>{answerLabels[answerValue]}</span>
                    </label>
                  ))}
                </div>
                {missingQuestionID === question.id && (
                  <p className="mt-2 text-sm text-red-700">Выберите один вариант ответа.</p>
                )}
              </fieldset>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button onClick={onClose}>Отмена</Button>
            {votingIndex > 0 && <Button onClick={goBack}>Назад</Button>}
            <Button variant="primary" onClick={goNext}>
              {votingIndex < votings.length - 1 ? "Далее" : "Перейти к проверке"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4">
            {votings.map((item) => (
              <div key={item.id} className="rounded-md border p-4 text-sm text-slate-700">
                <h4 className="font-semibold text-slate-900">{item.title || "Опросный лист"}</h4>
                <p className="mb-3 text-slate-500">{getVotingCategoryLabel(getVotingCategory(item))}</p>
                <div className="grid gap-2">
                  {(item.questions ?? []).map((question, index) => (
                    <p key={question.id}>
                      {index + 1}. {question.text} —{" "}
                      <span className="font-medium">
                        {answerLabels[answers[item.id]?.[question.id] as VotingAnswerValue] || "Не выбран"}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-md border p-4 text-sm text-slate-700">
              <p className="mb-2 font-medium text-slate-900">Способ подписания</p>
              <div className="flex flex-wrap gap-2">
                {(["MOCK_MGOV", "MOCK_ECP"] as VotingSignatureMock[]).map((method) => (
                  <label
                    key={method}
                    className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="signature-method"
                      checked={signatureMethod === method}
                      onChange={() => setSignatureMethod(method)}
                    />
                    <span>{signatureMethodLabels[method]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button onClick={goBack} disabled={submitting}>
              Назад
            </Button>
            <Button variant="primary" onClick={signAndSubmit} disabled={submitting}>
              {submitting ? "Сохраняем..." : "Подписать и завершить голосование"}
            </Button>
          </div>
        </>
      )}
    </ModalFrame>
  );
}

function MyAnswersModal({ voting, onClose }: { voting: Voting; onClose: () => void }) {
  const [answers, setAnswers] = useState<OwnerVotingAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchMyVotingAnswers(voting.id)
      .then((items) => {
        if (active) {
          setAnswers(Array.isArray(items) ? items : []);
          setError("");
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Не удалось загрузить ответы");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [voting.id]);

  const signature = answers[0];

  return (
    <ModalFrame title="Мои ответы" onClose={onClose}>
      <div className="mb-4 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
        <h3 className="text-lg font-semibold text-slate-900">{voting.title || "Опросный лист"}</h3>
        {signature?.signature_status && <p>Статус подписи: подписано</p>}
        {signature?.signature_method && (
          <p>Метод подписи: {signatureMethodLabels[signature.signature_method] || signature.signature_method}</p>
        )}
        {signature?.signed_at && <p>Подписано: {formatAstanaDateTime(signature.signed_at)}</p>}
      </div>

      {loading ? (
        <p className="text-slate-500">Загрузка...</p>
      ) : error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : (
        <div className="grid gap-3">
          {answers.map((answer, index) => (
            <div key={answer.question_id} className="rounded-md border p-4">
              <p className="font-medium">
                {index + 1}. {answer.question_text}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Мой ответ: <span className="font-medium">{answerLabels[answer.answer]}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Закрыть</Button>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
      <div className="mx-auto my-6 w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const classes =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "border bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${classes}`}
    >
      {children}
    </button>
  );
}

function statusBadgeClass(color: "blue" | "emerald" | "slate") {
  const classes = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return `rounded-full px-3 py-1 text-xs font-medium ${classes[color]}`;
}

function getVotingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    published: "Идет голосование",
    stopped: "Остановлено",
    completed: "Завершено",
    expired: "Завершено",
  };
  return labels[status] || status;
}

function getCompletionReason(voting: Voting) {
  if (voting.completion_reason) return voting.completion_reason;
  if (voting.completion_type === "manual_stop" || voting.status === "stopped") {
    return "Остановлено председателем";
  }
  return "Истёк установленный законодательством срок для сбора голосов.";
}

function formatCompletionDate(voting: Voting) {
  const value =
    voting.completed_at || voting.stopped_at || voting.expired_at || voting.publication_end_at;
  return value ? formatAstanaDateTime(value) : "Не указана";
}
