import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { VotingList } from "@/modules/dashboard-summary";
import { Placeholder } from "@/shared/ui/Placeholder";

export function VotingsPage({ votings, loadVotings }: CabinetModuleProps) {
  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Голосование</h1>
        <button
          onClick={loadVotings}
          className="rounded-xl border bg-white px-4 py-2"
        >
          Обновить
        </button>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <VotingList votings={votings} />
      </section>
    </>
  );
}

export function PastVotingsPage() {
  return (
    <Placeholder
      title="Прошедшие голосования"
      text="Здесь будет архив завершённых голосований."
    />
  );
}
