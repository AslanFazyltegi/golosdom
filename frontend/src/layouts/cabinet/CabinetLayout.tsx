"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import { createMeeting, fetchMeetings } from "@/lib/meetings";
import { fetchNavigation } from "@/lib/navigation";
import { fetchObjects } from "@/lib/objects";
import { fetchOwners, type MeetingOwner } from "@/lib/owners";
import { fetchVotings } from "@/lib/votings";
import type { Meeting } from "@/types/meeting";
import type { NavigationItem } from "@/types/navigation";
import type { User } from "@/types/user";
import type { Voting } from "@/types/voting";
import { CabinetHeader } from "./CabinetHeader";
import { CabinetSidebar } from "./CabinetSidebar";
import { CabinetWorkspace } from "./CabinetWorkspace";

declare global {
  interface Window {
    __votingConstructorDirty?: boolean;
  }
}

export function CabinetLayout() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [votings, setVotings] = useState<Voting[]>([]);
  const [menu, setMenu] = useState<NavigationItem[]>([]);
  const [objects, setObjects] = useState<unknown>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [expandedMenuCodes, setExpandedMenuCodes] = useState<string[]>([]);

  const [activeRole, setActiveRole] = useState("OWNER");
  const [activeComponent, setActiveComponent] = useState("dashboard");
  const [votingConstructorInitial, setVotingConstructorInitial] =
    useState<Voting | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Да\nНет\nВоздержался");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [meetingError, setMeetingError] = useState("");
  const [meetingInitiators, setMeetingInitiators] = useState<string[]>([
    "Председатель ОСИ",
    "Совет дома",
  ]);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("20:00");
  const [meetingLocationAddress, setMeetingLocationAddress] = useState("");
  const [meetingLocationDetail, setMeetingLocationDetail] =
    useState("Двор / 1-5 подъезд");
  const [meetingAgenda, setMeetingAgenda] = useState<string[]>([]);
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const [owners, setOwners] = useState<MeetingOwner[]>([]);

  async function loadMeetingsByComponent(component: string) {
    let period = "";

    if (component === "meetings_active") period = "active";
    if (component === "meetings_upcoming") period = "upcoming";
    if (component === "meetings_past") period = "past";

    if (!period) return;

    try {
      setMeetingError("");
      const data = await fetchMeetings(period);
      setMeetings(data);
    } catch (err) {
      setMeetingError(
        err instanceof Error ? err.message : "Не удалось загрузить собрания",
      );
    }
  }

  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    async function load() {
      let currentUser: User;

      try {
        currentUser = (await apiFetch("/api/v1/auth/me")) as User;
        setUser(currentUser);
      } catch {
        removeToken();
        router.push("/login");
        return;
      }

      try {
        const role = currentUser.roles?.[0] || "OWNER";
        setActiveRole(role);

        const menuData = await fetchNavigation(role);
        setMenu(menuData);

        const defaultItem =
          menuData.find((item) => item.is_default) || menuData[0];
        const defaultComponent = getModuleCode(defaultItem);
        setActiveComponent(defaultComponent);

        const objectsData = await fetchObjects(role);
        setObjects(objectsData);
        setMeetingLocationAddress(buildMeetingAddress(objectsData));

        try {
          const ownersData = await fetchOwners();
          setOwners(ownersData);
        } catch (err) {
          console.error("Не удалось загрузить собственников:", err);
          setOwners([]);
        }

        const votingData = await fetchVotings();
        setVotings(votingData);

        if (defaultComponent.startsWith("meetings")) {
          await loadMeetingsByComponent(defaultComponent);
        }
      } catch (err) {
        console.error("Не удалось загрузить данные кабинета:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  useEffect(() => {
    function confirmVotingNavigation(event: Event) {
      const custom = event as CustomEvent<{
        component: string;
        initialVoting?: Voting | null;
      }>;
      if (!custom.detail?.component) return;
      window.__votingConstructorDirty = false;
      setVotingConstructorInitial(
        custom.detail.component === "voting_constructor_create"
          ? custom.detail.initialVoting ?? null
          : null,
      );
      setActiveComponent(custom.detail.component);
      if (custom.detail.component.startsWith("meetings")) {
        void loadMeetingsByComponent(custom.detail.component);
      }
    }

    window.addEventListener(
      "voting-constructor-navigation-confirmed",
      confirmVotingNavigation,
    );
    return () =>
      window.removeEventListener(
        "voting-constructor-navigation-confirmed",
        confirmVotingNavigation,
      );
  }, []);

  async function loadVotings() {
    const data = await fetchVotings();
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
      setCreateError(
        err instanceof Error ? err.message : "Не удалось создать голосование",
      );
    } finally {
      setCreating(false);
    }
  }

  async function switchRole(role: string) {
    setActiveRole(role);

    const menuData = await fetchNavigation(role);
    setMenu(menuData);

    const defaultItem = menuData.find((item) => item.is_default) || menuData[0];
    const defaultComponent = getModuleCode(defaultItem);
    setVotingConstructorInitial(null);
    setActiveComponent(defaultComponent);

    const objectsData = await fetchObjects(role);
    setObjects(objectsData);
    setMeetingLocationAddress(buildMeetingAddress(objectsData));

    setExpandedMenuCodes([]);
    setRoleOpen(false);
    setAccountOpen(false);

    if (defaultComponent.startsWith("meetings")) {
      await loadMeetingsByComponent(defaultComponent);
    }
  }

  function toggleMenu(code: string) {
    setExpandedMenuCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  async function openNavigationItem(item: NavigationItem) {
    if (item.children && item.children.length > 0) {
      toggleMenu(item.code);
    }

    const component = getModuleCode(item);
    if (
      activeComponent === "voting_constructor_create" &&
      component !== activeComponent &&
      typeof window !== "undefined" &&
      window.__votingConstructorDirty
    ) {
      window.dispatchEvent(
        new CustomEvent("voting-constructor-navigation-request", {
          detail: { component },
        }),
      );
      return;
    }

    setVotingConstructorInitial(null);
    setActiveComponent(component);

    if (component.startsWith("meetings")) {
      await loadMeetingsByComponent(component);
    }
  }

  function openAccountModule(code: string) {
    setVotingConstructorInitial(null);
    setActiveComponent(code);
    setAccountOpen(false);
  }

  async function submitMeeting(e?: FormEvent) {
    e?.preventDefault();
    setMeetingError("");
    setCreatingMeeting(true);

    const agenda = meetingAgenda.map((item) => item.trim()).filter(Boolean);
    const scheduledAt = `${meetingDate}T${meetingTime}`;
    const location = [meetingLocationAddress.trim(), meetingLocationDetail.trim()]
      .filter(Boolean)
      .join(", ");

    if (meetingInitiators.length === 0) {
      setMeetingError("Укажите инициатора собрания");
      setCreatingMeeting(false);
      return;
    }

    if (!meetingDate) {
      setMeetingError("Укажите дату проведения собрания");
      setCreatingMeeting(false);
      return;
    }

    if (new Date(scheduledAt) < getMinMeetingDate()) {
      setMeetingError(
        "Дата проведения должна быть не раньше 5-го календарного дня, считая со следующего дня.",
      );
      setCreatingMeeting(false);
      return;
    }

    if (!location) {
      setMeetingError("Укажите место проведения собрания");
      setCreatingMeeting(false);
      return;
    }

    if (agenda.length === 0) {
      setMeetingError("Добавьте хотя бы один вопрос повестки");
      setCreatingMeeting(false);
      return;
    }

    try {
      console.log("CREATE MEETING PAYLOAD", {
        initiator_name: meetingInitiators.join(", "),
        scheduled_at: scheduledAt,
        location,
        agenda,
        meeting_form: "offline",
        status: "upcoming",
      });

      await createMeeting({
        initiator_name: meetingInitiators.join(", "),
        scheduled_at: scheduledAt,
        location,
        agenda,
        meeting_form: "offline",
        status: "upcoming",
      });

      setMeetingInitiators(["Председатель ОСИ", "Совет дома"]);
      setMeetingDate("");
      setMeetingTime("20:00");
      setMeetingLocationAddress(buildMeetingAddress(objects));
      setMeetingLocationDetail("Двор / 1-5 подъезд");
      setMeetingAgenda([""]);

      const data = await fetchMeetings("upcoming");
      setMeetings(data);
      setActiveComponent("meetings_upcoming");
    } catch (err) {
      setMeetingError(
        err instanceof Error ? err.message : "Не удалось создать собрание",
      );
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
      <CabinetHeader
        user={user}
        activeRole={activeRole}
        accountOpen={accountOpen}
        roleOpen={roleOpen}
        setAccountOpen={setAccountOpen}
        setRoleOpen={setRoleOpen}
        onOpenModule={openAccountModule}
        switchRole={switchRole}
        logout={logout}
      />

      <div className="flex h-screen pt-20">
        <CabinetSidebar
          menu={menu}
          activeComponent={activeComponent}
          expandedMenuCodes={expandedMenuCodes}
          onOpenItem={openNavigationItem}
        />

        <CabinetWorkspace
          user={user}
          objects={objects}
          owners={owners}
          activeRole={activeRole}
          activeComponent={activeComponent}
          votingConstructorInitial={votingConstructorInitial}
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
          meetingInitiators={meetingInitiators}
          setMeetingInitiators={setMeetingInitiators}
          meetingDate={meetingDate}
          setMeetingDate={setMeetingDate}
          meetingTime={meetingTime}
          setMeetingTime={setMeetingTime}
          meetingLocationAddress={meetingLocationAddress}
          setMeetingLocationAddress={setMeetingLocationAddress}
          meetingLocationDetail={meetingLocationDetail}
          setMeetingLocationDetail={setMeetingLocationDetail}
          meetingAgenda={meetingAgenda}
          setMeetingAgenda={setMeetingAgenda}
          creatingMeeting={creatingMeeting}
          submitMeeting={submitMeeting}
          logout={logout}
        />
      </div>
    </main>
  );
}

function getModuleCode(item?: NavigationItem) {
  return item?.component || item?.code || "dashboard";
}

function getMinMeetingDate() {
  const date = new Date();
  date.setDate(date.getDate() + 5);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildMeetingAddress(objects: unknown) {
  if (!objects || Array.isArray(objects)) return "Адрес дома не найден";

  const building = objects as Record<string, unknown>;

  return [
    building.city,
    building.district,
    building.building_name,
    building.street ? `ул. ${building.street}` : "",
    building.house_number ? `д. ${building.house_number}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
