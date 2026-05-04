"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import { fetchNavigation } from "@/lib/navigation";
import type { User } from "@/types/user";
import type { Voting } from "@/types/voting";
import type { NavigationItem } from "@/types/navigation";
import { fetchObjects } from "@/lib/objects";

type ViewMode = "dashboard" | "profile" | "settings";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [votings, setVotings] = useState<Voting[]>([]);
  const [menu, setMenu] = useState<NavigationItem[]>([]);
  const [objects, setObjects] = useState<any>(null);


  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const [activeRole, setActiveRole] = useState("OWNER");
  const [activeComponent, setActiveComponent] = useState("dashboard");
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

        const role = currentUser.roles?.[0] || "OWNER";
        setActiveRole(role);

        const menuData = await fetchNavigation(role);
        setMenu(menuData);

        const objectsData = await fetchObjects(role);
        setObjects(objectsData);

        const defaultItem = menuData.find((item) => item.is_default) || menuData[0];
        setActiveComponent(defaultItem?.component || "dashboard");

        const votingData = await apiFetch("/api/v1/votings");
        setVotings(votingData);
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

  async function switchRole(role: string) {
    setActiveRole(role);

    const menuData = await fetchNavigation(role);
    setMenu(menuData);

    const objectsData = await fetchObjects(role);
    setObjects(objectsData);

    const defaultItem = menuData.find((item) => item.is_default) || menuData[0];
    setActiveComponent(defaultItem?.component || "dashboard");

    setView("dashboard");
    setRoleOpen(false);
    setAccountOpen(false);
  }

  function openMenuItem(item: NavigationItem) {
    setActiveComponent(item.component);
    setView("dashboard");
  }

  function logout() {
    removeToken();
    router.push("/login");
  }

  if (loading) return <main className="p-6">Загрузка...</main>;
  if (!user) return null;

  const phone = "+7 (777) 123-45-67";

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
            <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border bg-white p-2 shadow-lg">
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
                      onClick={() => switchRole(role)}
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
            {menu.map((item) => (
              <div key={item.code}>
                <MenuItem
                  icon={item.icon}
                  text={item.title}
                  active={view === "dashboard" && activeComponent === item.component}
                  onClick={() => openMenuItem(item)}
                />

                {item.children.length > 0 && (
                  <div className="ml-8 mt-1 space-y-1">
                    {item.children.map((child) => (
                      <MenuItem
                        key={child.code}
                        icon={child.icon}
                        text={child.title}
                        active={view === "dashboard" && activeComponent === child.component}
                        small
                        onClick={() => openMenuItem(child)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <section className="ml-72 h-[calc(100vh-80px)] flex-1 overflow-y-auto p-8">
          {view === "dashboard" && (
            <WorkAreaTemplate
              objects={objects}
              activeRole={activeRole}
              activeComponent={activeComponent}
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

function WorkAreaTemplate(props: {
  objects: any;
  activeRole: string;
  activeComponent: string;
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
  const component = props.activeComponent;
  const isChairman = props.activeRole === "CHAIRMAN";
  const isAdmin = props.activeRole === "SYSTEM_ADMIN";

  if (component === "dashboard") {
    return <DashboardHome votings={props.votings} loadVotings={props.loadVotings} />;
  }

  if (component === "objects") {
    return (
      <ObjectsTemplate
        role={props.activeRole}
        objects={props.objects}
      />
    );
  }

  if (component === "meetings") {
    return <Placeholder title="Общедомовые собрания" text="Здесь будет общий раздел онлайн-собраний." />;
  }

  if (component === "meetings_active") {
    return <Placeholder title="Активные собрания" text="Здесь будут активные общедомовые собрания." />;
  }

  if (component === "meetings_upcoming") {
    return <Placeholder title="Предстоящие собрания" text="Здесь будут предстоящие собрания." />;
  }

  if (component === "meetings_past") {
    return <Placeholder title="Прошедшие собрания" text="Здесь будет архив прошедших собраний." />;
  }

  if (component === "votings" || component === "votings_active") {
    return <VotingsTemplate votings={props.votings} loadVotings={props.loadVotings} />;
  }

  if (component === "votings_past") {
    return <Placeholder title="Прошедшие голосования" text="Здесь будет архив завершённых голосований." />;
  }

  if (component === "voting_constructor" || component.startsWith("voting_constructor")) {
    if (!isChairman && !isAdmin) {
      return <Placeholder title="Нет доступа" text="У вашей активной роли нет доступа к конструктору голосования." />;
    }

    return <ConstructorTemplate {...props} />;
  }

  if (component === "notifications") {
    return <Placeholder title="Уведомления" text="Здесь будут уведомления пользователя." />;
  }

  return <Placeholder title="Раздел" text="Для этого пункта меню пока не настроен шаблон рабочей области." />;
}

function DashboardHome({
  votings,
  loadVotings,
}: {
  votings: Voting[];
  loadVotings: () => void;
}) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Дашборд (сводка)</h1>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="🏢" title="Мои объекты" value="1" />
        <StatCard icon="✅" title="Голосования" value={String(votings.length)} />
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

          <NewsItem title="Благоустройство дворовой территории" date="20.05.2024" />
          <NewsItem title="Плановое отключение воды" date="18.05.2024" />
          <NewsItem title="Отчёт управляющей компании за апрель" date="15.05.2024" />
        </section>
      </div>
    </>
  );
}

function VotingsTemplate({
  votings,
  loadVotings,
}: {
  votings: Voting[];
  loadVotings: () => void;
}) {
  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Голосование</h1>
        <button onClick={loadVotings} className="rounded-xl border bg-white px-4 py-2">
          Обновить
        </button>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <VotingList votings={votings} />
      </section>
    </>
  );
}

function ConstructorTemplate(props: {
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
  activeComponent: string;
}) {
  const titleMap: Record<string, string> = {
    voting_constructor: "Конструктор голосования",
    voting_constructor_create: "Создать новый опросный лист",
    voting_constructor_approval: "На утверждении у совета дома",
    voting_constructor_revision: "На доработке",
    voting_constructor_pending_publication: "Ожидающие публикации",
    voting_constructor_published: "Опубликованные",
    voting_constructor_draft: "Черновик",
  };

  const pageTitle = titleMap[props.activeComponent] || "Конструктор голосования";

  if (props.activeComponent !== "voting_constructor" && props.activeComponent !== "voting_constructor_create") {
    return (
      <Placeholder
        title={pageTitle}
        text="Здесь будет список опросных листов по выбранному статусу."
      />
    );
  }

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{pageTitle}</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
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
            placeholder="Варианты ответа, каждый с новой строки"
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

function VotingList({ votings }: { votings: Voting[] }) {
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

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{title}</h1>
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-slate-600">{text}</p>
      </section>
    </>
  );
}

function MenuItem({
  icon,
  text,
  active = false,
  small = false,
  onClick,
}: {
  icon: string;
  text: string;
  active?: boolean;
  small?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl text-left font-medium ${
        small ? "px-3 py-2 text-xs" : "px-4 py-4 text-sm"
      } ${
        active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className={small ? "text-base" : "text-xl"}>{icon}</span>
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

function ObjectsTemplate({
  role,
  objects,
}: {
  role: string;
  objects: any;
}) {
  if (!objects) {
    return <Placeholder title="Мои объекты" text="Загрузка данных..." />;
  }

if (
  role === "CHAIRMAN" ||
  role === "COUNCIL_MEMBER" ||
  role === "AUDITOR"
) {

  if (!objects) {
    return (
      <Placeholder
        title="Мой МЖК"
        text="Данные дома пока не заведены в системе."
      />
    );
  }

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">
        Мой МЖК
      </h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">

        <h2 className="mb-6 text-xl font-semibold">
          🏢 Данные дома
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">

          <InfoCard
            label="Город"
            value={objects.city}
          />

          <InfoCard
            label="Район"
            value={objects.district}
          />

          <InfoCard
            label="Улица"
            value={objects.street}
          />

          <InfoCard
            label="Дом"
            value={objects.house_number}
          />

          <InfoCard
            label="Этажность"
            value={objects.floors_count}
          />

          <InfoCard
            label="Подъезды"
            value={objects.entrances_count}
          />

          <InfoCard
            label="Квартиры"
            value={objects.apartments_count}
          />

          <InfoCard
            label="НП"
            value={objects.commercial_units_count}
          />

          <InfoCard
            label="Кладовые"
            value={objects.storerooms_count}
          />

          <InfoCard
            label="Паркоместа"
            value={objects.parking_spaces_count}
          />

        </div>

      </section>
    </>
  );
}

const ownerObjects = Array.isArray(objects)
  ? objects
  : [];

return (
  <>
    <h1 className="mb-8 text-3xl font-bold">
      Мои объекты
    </h1>

    {ownerObjects.length === 0 && (
      <section className="rounded-2xl border bg-white p-6 shadow-sm">

        <h2 className="mb-3 text-xl font-semibold">
          📭 Объекты не найдены
        </h2>

        <p className="text-slate-600">
          Для роли <b>{role}</b> объекты имущества пока не назначены.
        </p>

        <p className="mt-2 text-sm text-slate-500">
          Назначение объектов выполняется через базу данных
          или административный интерфейс.
        </p>

      </section>
    )}

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">

      {ownerObjects.map((item: any) => (

        <section
          key={`${item.property_type}-${item.number}`}
          className="rounded-2xl border bg-white p-6 shadow-sm"
        >

          <h2 className="text-xl font-semibold">

            {propertyTypeLabel(
              item.property_type,
            )}

            {" "}

            №{item.number}

          </h2>

          <p className="mt-3 text-slate-600">
            Площадь: {item.area} м²
          </p>

          <p className="mt-1 text-slate-500">
            Статус: {item.status}
          </p>

        </section>
      ))}
    </div>
  </>
);
}

function InfoCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value ?? "—"}</p>
    </div>
  );
}

function propertyTypeLabel(type: string) {
  const map: Record<string, string> = {
    apartment: "Квартира",
    parking: "Паркоместо",
    storage: "Кладовая",
    commercial_room: "НП",
  };

  return map[type] || type;
}