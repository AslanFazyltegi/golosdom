import type { CabinetModuleProps } from "@/shared/types/cabinet";

export function RoleSwitcherPage({ activeRole, user }: CabinetModuleProps) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Роль</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Текущая роль</h2>
        <p className="text-slate-600">Активная роль: {activeRole}</p>
        <p className="mt-2 text-slate-600">
          Доступные роли: {user.roles.join(", ")}
        </p>
      </section>
    </>
  );
}
