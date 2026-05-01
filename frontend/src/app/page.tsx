import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-3xl font-bold">ГолосДом</h1>

      <div className="space-y-3">
        <Link className="block rounded border p-3" href="/login">
          Войти
        </Link>
        <Link className="block rounded border p-3" href="/register">
          Регистрация
        </Link>
        <Link className="block rounded border p-3" href="/dashboard">
          Личный кабинет
        </Link>
      </div>
    </main>
  );
}