"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import { fetchNavigation } from "@/lib/navigation";
import { fetchObjects } from "@/lib/objects";
import { fetchMeetings, createMeeting } from "@/lib/meetings";
import type { User } from "@/types/user";
import type { Voting } from "@/types/voting";
import type { NavigationItem } from "@/types/navigation";
import type { Meeting } from "@/types/meeting";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

type ViewMode = "dashboard" | "profile" | "settings";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [votings, setVotings] = useState<Voting[]>([]);
  const [menu, setMenu] = useState<NavigationItem[]>([]);
  const [objects, setObjects] = useState<any>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [expandedMenuCodes, setExpandedMenuCodes] = useState<string[]>([]);

  const [activeRole, setActiveRole] = useState("OWNER");
  const [activeComponent, setActiveComponent] = useState("dashboard");
  const [view, setView] = useState<ViewMode>("dashboard");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Да\nНет\nВоздержался");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [meetingError, setMeetingError] = useState("");
  const [meetingInitiator, setMeetingInitiator] = useState("");
  const [meetingDateTime, setMeetingDateTime] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingAgendaText, setMeetingAgendaText] = useState("");
  const [creatingMeeting, setCreatingMeeting] = useState(false);

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
        console.log("MENU:", menuData);
        setMenu(menuData);

        const defaultItem = menuData.find((item) => item.is_default) || menuData[0];
        setActiveComponent(defaultItem?.component || "dashboard");

        const objectsData = await fetchObjects(role);
        setObjects(objectsData);

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
    console.log("MENU:", menuData);
    setMenu(menuData);

    const defaultItem = menuData.find((item) => item.is_default) || menuData[0];
    setActiveComponent(defaultItem?.component || "dashboard");

    const objectsData = await fetchObjects(role);
    setObjects(objectsData);

    setExpandedMenuCodes([]);
    setView("dashboard");
    setRoleOpen(false);
    setAccountOpen(false);
  }

  function toggleMenu(code: string) {
    setExpandedMenuCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    );
  }

  async function loadMeetingsByComponent(component: string) {
    let status = "";

    if (component === "meetings_active") status = "active";
    if (component === "meetings_upcoming") status = "upcoming";
    if (component === "meetings_past") status = "past";

    if (!status) return;

    try {
      setMeetingError("");
      const data = await fetchMeetings(status);
      setMeetings(data);
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : "Не удалось загрузить собрания");
    }
  }

  async function openNavigationItem(item: NavigationItem) {
    if (item.children && item.children.length > 0) {
      toggleMenu(item.code);
    }

    setActiveComponent(item.component);
    setView("dashboard");

    if (item.component.startsWith("meetings")) {
      await loadMeetingsByComponent(item.component);
    }
  }

  async function submitMeeting(e: FormEvent) {
    e.preventDefault();
    setMeetingError("");
    setCreatingMeeting(true);

    const agenda = meetingAgendaText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      await createMeeting({
        initiator_name: meetingInitiator,
        scheduled_at: new Date(meetingDateTime).toISOString(),
        location: meetingLocation,
        agenda,
      });

      setMeetingInitiator("");
      setMeetingDateTime("");
      setMeetingLocation("");
      setMeetingAgendaText("");

      const data = await fetchMeetings("upcoming");
      setMeetings(data);
      setActiveComponent("meetings_upcoming");
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : "Не удалось создать собрание");
    } finally {
      setCreatingMeeting(false);
    }
  }

  function logout() {
    removeToken();
    router.push("/login");
  }

  if (loading) return <main className="p-6">Загрузка...</main>;
  if (!user) return null;

  

  return (
    <main className="h-screen overflow-hidden bg-slate-50 text-slate-800">
          <DashboardHeader
            user={user}
            activeRole={activeRole}
            accountOpen={accountOpen}
            roleOpen={roleOpen}
            setAccountOpen={setAccountOpen}
            setRoleOpen={setRoleOpen}
            setView={setView}
            switchRole={switchRole}
            logout={logout}
          />

      <div className="flex h-screen pt-20">
              <DashboardSidebar
                menu={menu}
                view={view}
                activeComponent={activeComponent}
                expandedMenuCodes={expandedMenuCodes}
                onOpenItem={openNavigationItem}
              />


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
              meetings={meetings}
              meetingError={meetingError}
              meetingInitiator={meetingInitiator}
              setMeetingInitiator={setMeetingInitiator}
              meetingDateTime={meetingDateTime}
              setMeetingDateTime={setMeetingDateTime}
              meetingLocation={meetingLocation}
              setMeetingLocation={setMeetingLocation}
              meetingAgendaText={meetingAgendaText}
              setMeetingAgendaText={setMeetingAgendaText}
              creatingMeeting={creatingMeeting}
              submitMeeting={submitMeeting}
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
  meetings: Meeting[];
  meetingError: string;
  meetingInitiator: string;
  setMeetingInitiator: (v: string) => void;
  meetingDateTime: string;
  setMeetingDateTime: (v: string) => void;
  meetingLocation: string;
  setMeetingLocation: (v: string) => void;
  meetingAgendaText: string;
  setMeetingAgendaText: (v: string) => void;
  creatingMeeting: boolean;
  submitMeeting: (e: FormEvent) => void;
}) {
  const component = props.activeComponent;
  const isChairman = props.activeRole === "CHAIRMAN";
  const isAdmin = props.activeRole === "SYSTEM_ADMIN";

  if (component === "dashboard") {
    return <DashboardHome votings={props.votings} loadVotings={props.loadVotings} />;
  }

  if (component === "objects") {
    return <ObjectsTemplate role={props.activeRole} objects={props.objects} />;
  }

  if (component === "meetings") {
    return (
      <Placeholder
        title="Общедомовые собрания"
        text="Выберите подпункт: инициировать, активные, предстоящие или прошедшие собрания."
      />
    );
  }

  if (component === "meetings_create") {
    return <MeetingCreateTemplate {...props} />;
  }

  if (
    component === "meetings_active" ||
    component === "meetings_upcoming" ||
    component === "meetings_past"
  ) {
    return (
      <MeetingsListTemplate
        component={component}
        meetings={props.meetings}
        error={props.meetingError}
      />
    );
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

function DashboardHome({ votings, loadVotings }: { votings: Voting[]; loadVotings: () => void }) {
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

function ObjectsTemplate({ role, objects }: { role: string; objects: any }) {
  if (!objects) {
    return <Placeholder title="Мои объекты" text="Загрузка данных..." />;
  }

  if (role === "CHAIRMAN" || role === "COUNCIL_MEMBER" || role === "AUDITOR") {
    return (
      <>
        <h1 className="mb-8 text-3xl font-bold">Мой МЖК</h1>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-xl font-semibold">🏢 Данные дома</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Город" value={objects.city} />
            <InfoCard label="Район" value={objects.district} />
            <InfoCard label="Наименование ЖК" value={objects.building_name} />
            <InfoCard label="Улица" value={objects.street} />
            <InfoCard label="Дом" value={objects.house_number} />
            <InfoCard label="Этажность" value={objects.floors_count} />
            <InfoCard label="Подъезды" value={objects.entrances_count} />
            <InfoCard label="Квартиры" value={objects.apartments_count} />
            <InfoCard label="НП" value={objects.commercial_units_count} />
            <InfoCard label="Кладовые" value={objects.storerooms_count} />
            <InfoCard label="Паркоместа" value={objects.parking_spaces_count} />
          </div>
        </section>
      </>
    );
  }

  const ownerObjects = Array.isArray(objects) ? objects : [];

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Мои объекты</h1>

      {ownerObjects.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">📭 Объекты не найдены</h2>
          <p className="text-slate-600">
            Для роли <b>{role}</b> объекты имущества пока не назначены.
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
              {propertyTypeLabel(item.property_type)} №{item.number}
            </h2>
            <p className="mt-3 text-slate-600">Площадь: {item.area} м²</p>
            <p className="mt-1 text-slate-500">Статус: {item.status}</p>
          </section>
        ))}
      </div>
    </>
  );
}

function VotingsTemplate({ votings, loadVotings }: { votings: Voting[]; loadVotings: () => void }) {
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
    return <Placeholder title={pageTitle} text="Здесь будет список опросных листов по выбранному статусу." />;
  }

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{pageTitle}</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <form onSubmit={props.createVoting} className="grid gap-3">
          <input className="rounded-xl border p-3" placeholder="Название голосования" value={props.title} onChange={(e) => props.setTitle(e.target.value)} />
          <textarea className="rounded-xl border p-3" placeholder="Описание" value={props.description} onChange={(e) => props.setDescription(e.target.value)} />
          <input className="rounded-xl border p-3" placeholder="Вопрос" value={props.question} onChange={(e) => props.setQuestion(e.target.value)} />
          <textarea className="rounded-xl border p-3" rows={4} placeholder="Варианты ответа, каждый с новой строки" value={props.optionsText} onChange={(e) => props.setOptionsText(e.target.value)} />

          {props.createError && <p className="text-sm text-red-600">{props.createError}</p>}

          <button type="submit" disabled={props.creating} className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50">
            {props.creating ? "Создаём..." : "Создать голосование"}
          </button>
        </form>
      </section>
    </>
  );
}

function MeetingCreateTemplate(props: {
  meetingError: string;
  meetingInitiator: string;
  setMeetingInitiator: (v: string) => void;
  meetingDateTime: string;
  setMeetingDateTime: (v: string) => void;
  meetingLocation: string;
  setMeetingLocation: (v: string) => void;
  meetingAgendaText: string;
  setMeetingAgendaText: (v: string) => void;
  creatingMeeting: boolean;
  submitMeeting: (e: FormEvent) => void;
}) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Инициировать общедомовое собрание</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <form onSubmit={props.submitMeeting} className="grid gap-4">
          <input className="rounded-xl border p-3" placeholder="Инициатор собрания" value={props.meetingInitiator} onChange={(e) => props.setMeetingInitiator(e.target.value)} />
          <input className="rounded-xl border p-3" type="datetime-local" value={props.meetingDateTime} onChange={(e) => props.setMeetingDateTime(e.target.value)} />
          <input className="rounded-xl border p-3" placeholder="Место проведения" value={props.meetingLocation} onChange={(e) => props.setMeetingLocation(e.target.value)} />
          <textarea className="rounded-xl border p-3" rows={5} placeholder="Основные вопросы повестки, каждый с новой строки" value={props.meetingAgendaText} onChange={(e) => props.setMeetingAgendaText(e.target.value)} />

          <p className="text-sm text-slate-500">
            Дата проведения должна быть не раньше чем через 5 календарных дней.
          </p>

          {props.meetingError && <p className="text-sm text-red-600">{props.meetingError}</p>}

          <button type="submit" disabled={props.creatingMeeting} className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50">
            {props.creatingMeeting ? "Создаём..." : "Отправить на утверждение совету дома"}
          </button>
        </form>
      </section>
    </>
  );
}

function MeetingsListTemplate({ component, meetings, error }: { component: string; meetings: Meeting[]; error: string }) {
  const titleMap: Record<string, string> = {
    meetings_active: "Активные собрания",
    meetings_upcoming: "Предстоящие собрания",
    meetings_past: "Прошедшие собрания",
  };

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{titleMap[component] || "Собрания"}</h1>

      {error && (
        <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
          {error}
        </section>
      )}

      {meetings.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-slate-600">Данных по этому разделу пока нет.</p>
        </section>
      )}

      <div className="space-y-4">
        {meetings.map((meeting) => (
          <section key={meeting.id} className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{meeting.initiator_name}</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                {meeting.status}
              </span>
            </div>

            <p className="text-slate-600">
              <b>Дата:</b> {new Date(meeting.scheduled_at).toLocaleString("ru-RU")}
            </p>
            <p className="mt-1 text-slate-600">
              <b>Место:</b> {meeting.location}
            </p>

            <div className="mt-4">
              <p className="font-medium">Повестка:</p>
              <ul className="mt-2 list-disc pl-5 text-slate-600">
                {meeting.agenda.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ProfileView({ user, activeRole, logout }: { user: User; activeRole: string; logout: () => void }) {
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
    </>
  );
}

function SettingsView({ activeRole }: { activeRole: string }) {
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
              <p className="mt-1 text-sm text-slate-500">{voting.description || "Без описания"}</p>
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
  hasChildren = false,
  expanded = false,
  onClick,
}: {
  icon: string;
  text: string;
  active?: boolean;
  small?: boolean;
  hasChildren?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl text-left font-medium ${
        small ? "px-3 py-2 text-xs" : "px-4 py-4 text-sm"
      } ${active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"}`}
    >
      <span className="flex items-center gap-3">
        <span className={small ? "text-base" : "text-xl"}>{icon}</span>
        <span>{text}</span>
      </span>

      {hasChildren && (
        <span className="text-xs text-slate-400">
          {expanded ? "▲" : "▼"}
        </span>
      )}
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