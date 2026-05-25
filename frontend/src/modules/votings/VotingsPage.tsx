"use client";

import { useEffect, useState } from "react";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { fetchVotings } from "@/lib/votings";
import { formatAstanaDate, formatAstanaDateTime } from "@/shared/lib/dateTime";
import type { Voting } from "@/types/voting";

export function VotingsPage({ loadVotings }: CabinetModuleProps) {
  return (
    <OwnerVotingsList
      title="Активные голосования"
      status="active"
      emptyText="Нет активных голосований."
      onReloadLayout={loadVotings}
    />
  );
}

export function PastVotingsPage({ loadVotings }: CabinetModuleProps) {
  return (
    <OwnerVotingsList
      title="Прошедшие голосования"
      status="past"
      emptyText="Прошедших голосований пока нет."
      onReloadLayout={loadVotings}
    />
  );
}

function OwnerVotingsList({
  title,
  status,
  emptyText,
  onReloadLayout,
}: {
  title: string;
  status: "active" | "past";
  emptyText: string;
  onReloadLayout: () => void;
}) {
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setLoading(true);
      const items = await fetchVotings(status);
      setVotings(Array.isArray(items) ? items : []);
      onReloadLayout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить голосования");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{title}</h1>
        <button
          type="button"
          onClick={load}
          className="rounded-md border bg-white px-4 py-2 text-sm text-slate-700"
        >
          Обновить
        </button>
      </div>

      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        {loading ? (
          <p className="text-slate-500">Загрузка...</p>
        ) : votings.length === 0 ? (
          <p className="text-slate-500">{emptyText}</p>
        ) : (
          <div className="grid gap-4">
            {votings.map((voting) => (
              <OwnerVotingCard key={voting.id} voting={voting} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function OwnerVotingCard({ voting }: { voting: Voting }) {
  const questions = voting.questions ?? [];

  return (
    <article className="rounded-md border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{voting.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {voting.meeting
              ? `Собрание: ${formatAstanaDate(voting.meeting.scheduled_at)}`
              : "Собрание не указано"}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
          {getVotingStatusLabel(voting.status)}
        </span>
      </div>

      <div className="mb-4 grid gap-1 text-sm text-slate-700">
        <p>
          Крайний срок голосования:{" "}
          {voting.publication_end_at ? formatAstanaDateTime(voting.publication_end_at) : "Не указан"}
        </p>
        {voting.user_has_voted && <p className="text-emerald-700">Вы уже проголосовали</p>}
      </div>

      <div className="grid gap-2">
        {questions.map((question, index) => (
          <div key={`${question.id}-${index}`} className="rounded-md bg-slate-50 p-3">
            <p className="font-medium">
              {index + 1}. {question.text}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function getVotingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    published: "Идет голосование",
    stopped: "Остановлено",
    completed: "Завершено",
    expired: "Срок истек",
  };
  return labels[status] || status;
}
