import type { CabinetModuleProps } from "@/shared/types/cabinet";

export function DashboardSummaryPage({
  votings,
  loadVotings,
}: CabinetModuleProps) {
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

          <VotingList votings={votings.slice(0, 3)} />
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-semibold">Последние новости</h2>
            <button className="text-sm text-blue-600">Все новости ›</button>
          </div>

          <NewsItem
            title="Благоустройство дворовой территории"
            date="20.05.2024"
          />
          <NewsItem title="Плановое отключение воды" date="18.05.2024" />
          <NewsItem
            title="Отчёт управляющей компании за апрель"
            date="15.05.2024"
          />
        </section>
      </div>
    </>
  );
}

export function VotingList({
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

function NewsItem({ title, date }: { title: string; date: string }) {
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
