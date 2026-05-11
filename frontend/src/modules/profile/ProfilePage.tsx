import type { CabinetModuleProps } from "@/shared/types/cabinet";

export function ProfilePage({ activeRole, logout, user }: CabinetModuleProps) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">👤 Профиль</h1>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Основные данные</h2>
        <p>
          <b>Имя:</b> {user.full_name}
        </p>
        <p>
          <b>Email / логин:</b> {user.email}
        </p>
        <p>
          <b>Активная роль:</b> {activeRole}
        </p>
        <p>
          <b>Все роли:</b> {user.roles.join(", ")}
        </p>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">🔐 Безопасность</h2>
        <button className="mr-3 rounded-xl border px-4 py-2">
          Смена пароля
        </button>
        <button
          onClick={logout}
          className="rounded-xl border border-red-200 px-4 py-2 text-red-600"
        >
          Выход со всех других сессий
        </button>
      </section>
    </>
  );
}
