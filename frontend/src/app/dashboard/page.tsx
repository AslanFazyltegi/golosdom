"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import type { User } from "@/types/user";
import type { Voting } from "@/types/voting";

type ViewMode = "dashboard" | "profile" | "settings";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [activeRole, setActiveRole] = useState("OWNER");
  const [view, setView] = useState<ViewMode>("dashboard");

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
        setActiveRole(currentUser.roles?.[0] || "OWNER");

        const data = await apiFetch("/api/v1/votings");
        setVotings(data);
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
    const data = await apiFetch("/api/v1/votings");
    setVotings(data);
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
        body: JSON.stringify({ title, description, question, options }),
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

  if (loading) return <main className="p-6">Загрузка...</main>;
  if (!user) return null;

  const phone = "+7 (777) 123-45-67";
  const menuItems = getMenuByRole(activeRole);

  return (
    <main className="h-screen overflow-hidden bg-slate-50 text-slate-800">
      <header className="fixed left-0 right-0 top-0 z-30 flex h-20 items-center justify-between border-b bg-white px-8 shadow-sm">
        <div className="flex h-12 w-48 items-center justify-center rounded-xl border bg-white text-slate-500">
          Лого
        </div>

        <div className="relative">
          <button
            onClick={() => setAccountOpen(!accountOpen)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
              👤
            </div>

            <div className="min-w-40 text-right">
              <p className="text-sm font-medium">{phone}</p>
              <p className="text-xs text-slate-500">{activeRole}</p>
            </div>

            <span className="text-slate-500">⌄</span>
          </button>

          {accountOpen && (
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border bg-white p-2 shadow-lg">
              <button
                onClick={() => setRoleOpen(!roleOpen)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left hover:bg-slate-50"
              >
                <span>Роль</span>
                <span className="text-sm text-slate-500">{activeRole}</span>
              </button>

              {roleOpen && (
                <div className="mb-2 rounded-xl bg-slate-50 p-2">
                  {user.roles.map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        setActiveRole(role);
                        setRoleOpen(false);
                        setView("dashboard");
                      }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                        activeRole === role ? "bg-blue-600 text-white" : "hover:bg-white"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => {
                  setView("profile");
                  setAccountOpen(false);
                }}
                className="block w-full rounded-xl px-4 py-3 text-left hover:bg-slate-50"
              >
                Профиль
              </button>

              <button
                onClick={() => {
                  setView("settings");
                  setAccountOpen(false);
                }}
                className="block w-full rounded-xl px-4 py-3 text-left hover:bg-slate-50"
              >
                Настройки системы
              </button>

              <div className="my-2 border-t" />

              <button
                onClick={logout}
                className="block w-full rounded-xl px-4 py-3 text-left text-red-600 hover:bg-red-50"
              >
                Выход
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex h-screen pt-20">
        <aside className="fixed left-0 top-20 h-[calc(100vh-80px)] w-72 overflow-y-auto border-r bg-white p-5">
          <nav className="space-y-2">
            {menuItems.map((item) => (
              <MenuItem
                key={item.text}
                icon={item.icon}
                text={item.text}
                active={view === "dashboard" && item.active}
                onClick={() => setView("dashboard")}
              />
            ))}
          </nav>
        </aside>

        <section className="ml-72 h-[calc(100vh-80px)] flex-1 overflow-y-auto p-8">
          {view === "dashboard" && (
            <DashboardView
              activeRole={activeRole}
              votings={votings}
              loadVotings={loadVotings}
              createVoting={createVoting}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              question={question}
              setQuestion={setQuestion}
              optionsText={optionsText}
              setOptionsText={setOptionsText}
              creating={creating}
              createError={createError}
            />
          )}

          {view === "profile" && (
            <ProfileView user={user} activeRole={activeRole} logout={logout} />
          )}

          {view === "settings" && <SettingsView activeRole={activeRole} />}
        </section>
      </div>
    </main>
  );
}

function DashboardView(props: {
  activeRole: string;
  votings: Voting[];
  loadVotings: () => void;
  createVoting: (e: FormEvent) => void;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  question: string;
  setQuestion: (v: string) => void;
  optionsText: string;
  setOptionsText: (v: string) => void;
  creating: boolean;
  createError: string;
}) {
  const isChairman = props.activeRole === "CHAIRMAN";
  const isAdmin = props.activeRole === "SYSTEM_ADMIN";

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Дашборд (сводка)</h1>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="🏢" title="Мои объекты" value="1" />
        <StatCard icon="✅" title="Голосования" value={String(props.votings.length)} />
        <StatCard icon="👥" title="Онлайн-собрания" value="0" />
        <StatCard icon="🔔" title="Уведомления" value="0" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-semibold">Последние голосования</h2>
            <button onClick={props.loadVotings} className="text-sm text-blue-600">
              Обновить ›
            </button>
          </div>

          <div className="space-y-4">
            {props.votings.length === 0 && (
              <p className="text-slate-500">Пока нет доступных голосований.</p>
            )}

            {props.votings.slice(0, 3).map((voting) => (
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
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-semibold">Последние новости</h2>
            <button className="text-sm text-blue-600">Все новости ›</button>
          </div>

          <NewsItem title="Благоустройство дворовой территории" date="20.05.2024" />
          <NewsItem title="Плановое отключение воды" date="18.05.2024" />
          <NewsItem title="Отчёт управляющей компании за апрель" date="15.05.2024" />
        </section>
      </div>

      {isChairman && (
        <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Конструктор голосования</h2>

          <form onSubmit={props.createVoting} className="grid gap-3">
            <input
              className="rounded-xl border p-3"
              placeholder="Название голосования"
              value={props.title}
              onChange={(e) => props.setTitle(e.target.value)}
            />

            <textarea
              className="rounded-xl border p-3"
              placeholder="Описание"
              value={props.description}
              onChange={(e) => props.setDescription(e.target.value)}
            />

            <input
              className="rounded-xl border p-3"
              placeholder="Вопрос"
              value={props.question}
              onChange={(e) => props.setQuestion(e.target.value)}
            />

            <textarea
              className="rounded-xl border p-3"
              rows={4}
              placeholder="Варианты ответа"
              value={props.optionsText}
              onChange={(e) => props.setOptionsText(e.target.value)}
            />

            {props.createError && <p className="text-sm text-red-600">{props.createError}</p>}

            <button
              type="submit"
              disabled={props.creating}
              className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
            >
              {props.creating ? "Создаём..." : "Создать голосование"}
            </button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Администрирование</h2>
          <p className="mt-2 text-slate-500">
            Здесь будут пользователи, роли, настройки доступа и системный аудит.
          </p>
        </section>
      )}
    </>
  );
}

function ProfileView({
  user,
  activeRole,
  logout,
}: {
  user: User;
  activeRole: string;
  logout: () => void;
}) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">👤 Профиль</h1>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Основные данные</h2>
        <p><b>Имя:</b> {user.full_name}</p>
        <p><b>Email / логин:</b> {user.email}</p>
        <p><b>Активная роль:</b> {activeRole}</p>
        <p><b>Все роли:</b> {user.roles.join(", ")}</p>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">🔐 Безопасность</h2>
        <button className="mr-3 rounded-xl border px-4 py-2">Смена пароля</button>
        <button onClick={logout} className="rounded-xl border border-red-200 px-4 py-2 text-red-600">
          Выход со всех других сессий
        </button>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">📄 Общая информация</h2>
        <p><b>Дата регистрации:</b> пока не подключено</p>
        <p><b>Статус аккаунта:</b> active</p>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">📄 История действий</h2>
        <ol className="list-decimal space-y-2 pl-5 text-slate-600">
          <li>Вход в личный кабинет</li>
          <li>Просмотр доступных голосований</li>
          <li>Открытие профиля</li>
          <li>Обновление списка голосований</li>
          <li>Переход в настройки</li>
          <li>Смена активной роли</li>
          <li>Просмотр дашборда</li>
          <li>Открытие меню аккаунта</li>
          <li>Проверка данных профиля</li>
          <li>Системная проверка доступа</li>
        </ol>
      </section>
    </>
  );
}

function SettingsView({ activeRole }: { activeRole: string }) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Настройки системы</h1>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Интерфейс</h2>
        <label className="mb-3 flex items-center gap-3">
          <input type="checkbox" defaultChecked />
          Показывать уведомления в личном кабинете
        </label>
        <label className="mb-3 flex items-center gap-3">
          <input type="checkbox" defaultChecked />
          Использовать компактное меню
        </label>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Безопасность</h2>
        <label className="mb-3 flex items-center gap-3">
          <input type="checkbox" />
          Требовать повторный вход для критичных действий
        </label>
        <label className="mb-3 flex items-center gap-3">
          <input type="checkbox" defaultChecked />
          Показывать историю действий
        </label>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Доступ</h2>
        <p className="text-slate-600">Активная роль: {activeRole}</p>
        <p className="mt-2 text-slate-500">
          В будущем здесь будут настройки уведомлений, языка, темы, безопасности и прав доступа.
        </p>
      </section>
    </>
  );
}

function getMenuByRole(role: string) {
  if (role === "SYSTEM_ADMIN") {
    return [
      { icon: "🏠", text: "Дашборд администратора", active: true },
      { icon: "👥", text: "Пользователи" },
      { icon: "🔐", text: "Роли и доступы" },
      { icon: "📄", text: "Системный аудит" },
      { icon: "⚙️", text: "Настройки системы" },
    ];
  }

  if (role === "CHAIRMAN") {
    return [
      { icon: "🏠", text: "Дашборд (сводка)", active: true },
      { icon: "🏢", text: "Мои объекты" },
      { icon: "🗳️", text: "Голосование" },
      { icon: "🛠️", text: "Конструктор голосования" },
      { icon: "🎥", text: "Онлайн-собрание" },
      { icon: "🔔", text: "Уведомления" },
    ];
  }

  return [
    { icon: "🏠", text: "Дашборд (сводка)", active: true },
    { icon: "🏢", text: "Мои объекты" },
    { icon: "🗳️", text: "Активные голосования" },
    { icon: "📰", text: "Новости" },
    { icon: "📢", text: "Объявления" },
    { icon: "🔔", text: "Уведомления" },
  ];
}

function MenuItem({
  icon,
  text,
  active = false,
  onClick,
}: {
  icon: string;
  text: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-medium ${
        active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span>{text}</span>
    </button>
  );
}

function StatCard({ icon, title, value }: { icon: string; title: string; value: string }) {
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