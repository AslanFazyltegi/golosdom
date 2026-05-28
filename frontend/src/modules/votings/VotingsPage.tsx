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
type WizardStep = "answers" | "signature";

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
  const [wizardVoting, setWizardVoting] = useState<Voting | null>(null);
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
      setWizardVoting(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть голосование");
    } finally {
      setOpeningVotingId("");
    }
  }

  async function handleVoteSuccess() {
    setWizardVoting(null);
    setSuccess("Ваш голос успешно принят и подписан.");
    await load();
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

      {wizardVoting && (
        <VotingWizard
          voting={wizardVoting}
          onClose={() => setWizardVoting(null)}
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

function VotingWizard({
  voting,
  onClose,
  onSuccess,
}: {
  voting: Voting;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const questions = voting.questions ?? [];
  const [step, setStep] = useState<WizardStep>("answers");
  const [answers, setAnswers] = useState<Record<string, VotingAnswerValue>>({});
  const [signatureMethod, setSignatureMethod] = useState<VotingSignatureMock>("MOCK_MGOV");
  const [error, setError] = useState("");
  const [missingQuestionID, setMissingQuestionID] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validateAnswers() {
    const missingIndex = questions.findIndex((question) => !answers[question.id]);
    if (missingIndex >= 0) {
      setMissingQuestionID(questions[missingIndex].id);
      setError(`Ответьте на вопрос №${missingIndex + 1}`);
      return false;
    }
    setMissingQuestionID("");
    setError("");
    return true;
  }

  function goToSignature() {
    if (!validateAnswers()) return;
    setStep("signature");
  }

  async function signAndSubmit() {
    if (!validateAnswers()) {
      setStep("answers");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await submitOwnerVote(voting.id, {
        signature_method: signatureMethod,
        answers: questions.map((question) => ({
          question_id: question.id,
          answer: answers[question.id],
        })),
      });
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
        <h3 className="text-lg font-semibold text-slate-900">{voting.title || "Опросный лист"}</h3>
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
                        checked={answers[question.id] === answerValue}
                        onChange={() =>
                          setAnswers((current) => ({ ...current, [question.id]: answerValue }))
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

          <div className="mt-6 flex justify-end gap-3">
            <Button onClick={onClose}>Отмена</Button>
            <Button variant="primary" onClick={goToSignature}>
              Голосовать
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 rounded-md border p-4 text-sm text-slate-700">
            <p>1. Проверка данных</p>
            <p>2. Запрос на подписание через mGov/ЭЦП</p>
            <div>
              <p className="mb-2">Способ подписания</p>
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
            <p>3. Подтвердите имитацию успешного подписания.</p>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button onClick={() => setStep("answers")} disabled={submitting}>
              Назад
            </Button>
            <Button variant="primary" onClick={signAndSubmit} disabled={submitting}>
              {submitting ? "Сохраняем..." : "Имитировать успешное подписание"}
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
