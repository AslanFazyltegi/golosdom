"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import type { User } from "@/types/user";
import type { Voting } from "@/types/voting";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingsLoading, setVotingsLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Да\nНет\nВоздержался");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    async function load() {
      try {
        const currentUser = await apiFetch("/api/v1/auth/me");
        setUser(currentUser);
        await loadVotings();
      } catch {
        removeToken();
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  async function loadVotings() {
    setVotingsLoading(true);
    try {
      const data = await apiFetch("/api/v1/votings");
      setVotings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить голосования");
    } finally {
      setVotingsLoading(false);
    }
  }

  async function createVoting(e: FormEvent) {
    e.preventDefault();

    setCreateError("");
    setCreating(true);

    const options = optionsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      await apiFetch("/api/v1/votings", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          question,
          options,
        }),
      });

      setTitle("");
      setDescription("");
      setQuestion("");
      setOptionsText("Да\nНет\nВоздержался");

      await loadVotings();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Не удалось создать голосование");
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    removeToken();
    router.push("/login");
  }

  if (loading) {
    return <main className="p-6">Загрузка...</main>;
  }

  if (!user) {
    return null;
  }

  const isOwner = user.roles.includes("OWNER");
  const isChairman = user.roles.includes("CHAIRMAN");
  const isCouncilMember = user.roles.includes("COUNCIL_MEMBER");
  const isAuditor = user.roles.includes("AUDITOR");
  const isSystemAdmin = user.roles.includes("SYSTEM_ADMIN");

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Личный кабинет</h1>
          <p className="text-sm text-gray-600">MVP-версия портала голосований ОСИ</p>
        </div>

        <button onClick={logout} className="rounded border px-4 py-2">
          Выйти
        </button>
      </div>

      {error && (
        <section className="mb-6 rounded border border-red-300 p-4 text-red-600">
          {error}
        </section>
      )}

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

      {isChairman && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Конструктор голосования</h2>

          <form onSubmit={createVoting} className="space-y-3">
            <input
              className="w-full rounded border p-2"
              placeholder="Название голосования"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <textarea
              className="w-full rounded border p-2"
              placeholder="Описание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <input
              className="w-full rounded border p-2"
              placeholder="Вопрос"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />

            <textarea
              className="w-full rounded border p-2"
              placeholder="Варианты ответа, каждый с новой строки"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
            />

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <button
              type="submit"
              disabled={creating}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {creating ? "Создаём..." : "Создать голосование"}
            </button>
          </form>
        </section>
      )}

      {(isOwner || isChairman || isCouncilMember || isAuditor || isSystemAdmin) && (
        <section className="mb-6 rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Доступные голосования</h2>
            <button onClick={loadVotings} className="rounded border px-3 py-1">
              Обновить
            </button>
          </div>

          {votingsLoading && <p>Загрузка голосований...</p>}

          {!votingsLoading && votings.length === 0 && (
            <p>Пока нет доступных голосований.</p>
          )}

          <div className="space-y-3">
            {votings.map((voting) => (
              <article key={voting.id} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{voting.title}</h3>
                  <span className="rounded border px-2 py-1 text-xs">
                    {voting.status}
                  </span>
                </div>

                <p className="mb-3 text-sm text-gray-700">{voting.description}</p>

                {voting.questions.map((q) => (
                  <div key={q.id} className="rounded bg-gray-50 p-3">
                    <p className="mb-2 font-medium">{q.text}</p>
                    <ul className="list-disc pl-5 text-sm">
                      {q.options.map((option) => (
                        <li key={option}>{option}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </section>
      )}

      {isCouncilMember && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Совет дома</h2>
          <p>Пока заглушка для роли члена совета дома.</p>
        </section>
      )}

      {isAuditor && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Ревизор</h2>
          <p>Пока заглушка для роли ревизора.</p>
        </section>
      )}

      {isSystemAdmin && (
        <section className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Администрирование</h2>
          <p>Пока заглушка для системного администратора.</p>
        </section>
      )}
    </main>
  );
}