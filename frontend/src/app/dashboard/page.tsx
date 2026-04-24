"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import type { User } from "@/types/user";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    apiFetch("/api/v1/auth/me")
      .then(setUser)
      .catch(() => {
        removeToken();
        router.push("/login");
      });
  }, [router]);

  function logout() {
    removeToken();
    router.push("/login");
  }

  if (!user) return <div className="p-6">Загрузка...</div>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Личный кабинет</h1>
        <button onClick={logout} className="rounded border px-4 py-2">
          Выйти
        </button>
      </div>

      <section className="mb-6 rounded border p-4">
        <h2 className="mb-3 text-xl font-semibold">Профиль</h2>
        <p><b>ФИО:</b> {user.full_name}</p>
        <p><b>Email:</b> {user.email}</p>
        <p><b>Роли:</b> {user.roles.join(", ")}</p>
      </section>

      <section className="mb-6 rounded border p-4">
        <h2 className="mb-3 text-xl font-semibold">Настройки аккаунта</h2>
        <ul className="list-disc pl-5">
          <li>Смена пароля — скоро</li>
          <li>Редактирование профиля — скоро</li>
        </ul>
      </section>

      {user.roles.includes("OWNER") && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Доступные голосования</h2>
          <p>Пока заглушка. Здесь будет список активных голосований.</p>
        </section>
      )}

      {user.roles.includes("CHAIRMAN") && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Конструктор голосования</h2>
          <p>У вас есть роль председателя ОСИ.</p>
          <p className="mt-2">Здесь позже будет создание и управление голосованиями.</p>
        </section>
      )}

      {user.roles.includes("COUNCIL_MEMBER") && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Совет дома</h2>
          <p>Пока заглушка для роли члена совета дома.</p>
        </section>
      )}

      {user.roles.includes("AUDITOR") && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Ревизор</h2>
          <p>Пока заглушка для роли ревизора.</p>
        </section>
      )}

      {user.roles.includes("SYSTEM_ADMIN") && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Администрирование</h2>
          <p>Пока заглушка для системного администратора.</p>
        </section>
      )}
    </main>
  );
}