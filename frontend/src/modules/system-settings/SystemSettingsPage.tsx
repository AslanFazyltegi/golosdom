import type { CabinetModuleProps } from "@/shared/types/cabinet";

export function SystemSettingsPage({ activeRole }: CabinetModuleProps) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Настройки системы</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Доступ</h2>
        <p className="text-slate-600">Активная роль: {activeRole}</p>
      </section>
    </>
  );
}
