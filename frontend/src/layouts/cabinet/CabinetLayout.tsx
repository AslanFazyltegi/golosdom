"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import { createMeeting, fetchMeetings } from "@/lib/meetings";
import { fetchCommunicationUnreadCounts } from "@/lib/communications";
import { fetchNavigation } from "@/lib/navigation";
import {
  fetchObjects,
  fetchPropertyCorrectionRequestCount,
} from "@/lib/objects";
import { fetchOwners, type MeetingOwner } from "@/lib/owners";
import { fetchProfile, updateProfile as saveProfile } from "@/lib/profile";
import { fetchVotings } from "@/lib/votings";
import { addAstanaDays, formatAstanaDateKey } from "@/shared/lib/dateTime";
import type { Meeting } from "@/types/meeting";
import type { NavigationItem } from "@/types/navigation";
import type { UpdateProfilePayload, UserProfile } from "@/types/profile";
import type { SubmitMeetingOptions } from "@/shared/types/cabinet";
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [correctionRequestsBadgeCount, setCorrectionRequestsBadgeCount] =
    useState(0);

  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
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
  const [profileError, setProfileError] = useState("");
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
        const baseMenu =
          role === "OWNER"
            ? await withCommunicationUnreadCounts(menuData)
            : menuData;
        setMenu(baseMenu);

        const defaultItem =
          menuData.find((item) => item.is_default) || menuData[0];
        const defaultComponent = getModuleCode(defaultItem);
        setActiveComponent(defaultComponent);

        const objectsData = await fetchObjects(role);
        setObjects(objectsData);
        setMeetingLocationAddress(buildMeetingAddress(objectsData));

        await loadProfile(role);

        try {
          const ownersData = await fetchOwners();
          setOwners(ownersData);
        } catch (err) {
          console.error("Не удалось загрузить собственников:", err);
          setOwners([]);
        }

        const votingData = await fetchVotings();
        setVotings(votingData);
        const correctionCount = await loadCorrectionRequestsBadgeCount(role);
        setCorrectionRequestsBadgeCount(correctionCount);
        setMenu(applyNavigationBadges(baseMenu, votingData, correctionCount));

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
    setMenu((current) =>
      applyNavigationBadges(current, data, correctionRequestsBadgeCount),
    );
  }

  async function refreshCommunicationUnreadCounts() {
    if (activeRole !== "OWNER") return;
    try {
      const counts = await fetchCommunicationUnreadCounts();
      setMenu((current) => applyCommunicationUnreadCounts(current, counts));
    } catch (err) {
      console.error("Не удалось загрузить счётчики инфоцентра:", err);
    }
  }

  function updateCorrectionRequestsBadgeCount(count: number) {
    const safeCount = Math.max(0, count);
    setCorrectionRequestsBadgeCount(safeCount);
    setMenu((current) => applyCorrectionRequestsBadgeCount(current, safeCount));
  }

  async function loadProfile(role: string) {
    try {
      setProfileError("");
      const data = await fetchProfile(role);
      setProfile(data);
      setUser((current) => syncUserFromProfile(current, data));
    } catch (err) {
      setProfile(null);
      setProfileError(
        err instanceof Error ? err.message : "Не удалось загрузить профиль",
      );
    }
  }

  async function updateCurrentProfile(payload: UpdateProfilePayload) {
    setProfileError("");
    const data = await saveProfile(activeRole, payload);
    setProfile(data);
    setUser((current) => syncUserFromProfile(current, data));
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
    const currentComponent = activeComponent;
    setActiveRole(role);

    const menuData = await fetchNavigation(role);
    const baseMenu =
      role === "OWNER" ? await withCommunicationUnreadCounts(menuData) : menuData;
    setMenu(baseMenu);

    const defaultItem = menuData.find((item) => item.is_default) || menuData[0];
    const defaultComponent = getModuleCode(defaultItem);
    setVotingConstructorInitial(null);
    const nextComponent = getComponentAfterRoleSwitch(
      currentComponent,
      menuData,
      defaultComponent,
    );
    setActiveComponent(nextComponent);

    const objectsData = await fetchObjects(role);
    setObjects(objectsData);
    setMeetingLocationAddress(buildMeetingAddress(objectsData));
    await loadProfile(role);

    const votingData = await fetchVotings();
    setVotings(votingData);
    const correctionCount = await loadCorrectionRequestsBadgeCount(role);
    setCorrectionRequestsBadgeCount(correctionCount);
    setMenu(applyNavigationBadges(baseMenu, votingData, correctionCount));

    setExpandedMenuCodes([]);
    setAccountOpen(false);

    if (nextComponent.startsWith("meetings")) {
      await loadMeetingsByComponent(nextComponent);
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

  async function submitMeeting(e?: FormEvent | SubmitMeetingOptions) {
    let options: SubmitMeetingOptions = {};
    if (e && "preventDefault" in e) {
      e.preventDefault();
    } else if (e) {
      options = e;
    }

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

    if (meetingDate < getMinMeetingDateValue()) {
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

    const buildingID = getBuildingID(objects);
    if (!buildingID) {
      setMeetingError("Не удалось определить дом для публикации");
      setCreatingMeeting(false);
      return;
    }

    const notificationHtml = options.notificationHtml?.trim() ?? "";
    if (!notificationHtml) {
      setMeetingError("Не удалось получить шаблон уведомления");
      setCreatingMeeting(false);
      return;
    }

    try {
      console.log("CREATE MEETING PAYLOAD", {
        initiator_name: meetingInitiators.join(", "),
        scheduled_at: scheduledAt,
        location,
        agenda,
        meeting_form: options.meetingForm || "offline",
        status: "upcoming",
        building_id: buildingID,
      });

      await createMeeting({
        initiator_name: meetingInitiators.join(", "),
        scheduled_at: scheduledAt,
        location,
        agenda,
        meeting_form: options.meetingForm || "offline",
        status: "upcoming",
        building_id: buildingID,
        deduplication_key: options.deduplicationKey || "",
        notification_html: notificationHtml,
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
        setAccountOpen={setAccountOpen}
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
          profile={profile}
          profileError={profileError}
          menu={menu}
          activeRole={activeRole}
          activeComponent={activeComponent}
          openModule={openAccountModule}
          switchRole={switchRole}
          refreshCommunicationUnreadCounts={refreshCommunicationUnreadCounts}
          updateCorrectionRequestsBadgeCount={updateCorrectionRequestsBadgeCount}
          updateProfile={updateCurrentProfile}
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

function getComponentAfterRoleSwitch(
  currentComponent: string,
  menu: NavigationItem[],
  defaultComponent: string,
) {
  if (isAccountComponent(currentComponent)) return currentComponent;
  if (isComponentAvailable(currentComponent, menu)) return currentComponent;

  return defaultComponent;
}

function isAccountComponent(component: string) {
  return component === "profile" || component === "system_settings";
}

function isComponentAvailable(component: string, menu: NavigationItem[]) {
  return flattenMenu(menu).some((item) => getModuleCode(item) === component);
}

function flattenMenu(menu: NavigationItem[]): NavigationItem[] {
  return menu.flatMap((item) => [
    item,
    ...(item.children ? flattenMenu(item.children) : []),
  ]);
}

function syncUserFromProfile(current: User | null, profile: UserProfile) {
  if (!current) return current;

  return {
    ...current,
    full_name: profile.user.full_name,
    email: profile.user.email,
    phone: profile.user.phone,
    photo: profile.user.photo,
    roles: profile.roles,
  };
}

function getMinMeetingDateValue() {
  return formatAstanaDateKey(addAstanaDays(new Date(), 5));
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

function getBuildingID(objects: unknown) {
  if (!objects || Array.isArray(objects)) return "";

  const building = objects as Record<string, unknown>;
  return typeof building.id === "string" ? building.id : "";
}

async function withCommunicationUnreadCounts(menu: NavigationItem[]) {
  try {
    const counts = await fetchCommunicationUnreadCounts();
    return applyCommunicationUnreadCounts(menu, counts);
  } catch {
    return menu;
  }
}

function applyCommunicationUnreadCounts(
  menu: NavigationItem[],
  counts: { news?: number; announcement?: number; notification?: number },
): NavigationItem[] {
  const codeToCount: Record<string, number | undefined> = {
    communication_news: counts.news,
    communication_announcements: counts.announcement,
    communication_notifications: counts.notification,
  };
  return menu.map((item) => ({
    ...item,
    unread_count: codeToCount[item.code] || 0,
    children: item.children
      ? applyCommunicationUnreadCounts(item.children, counts)
      : item.children,
  }));
}

async function loadCorrectionRequestsBadgeCount(role: string) {
  if (role.trim().toUpperCase() !== "CHAIRMAN") return 0;

  try {
    const data = await fetchPropertyCorrectionRequestCount();
    return data.pendingCount || 0;
  } catch (err) {
    console.error("Не удалось загрузить счётчик заявок на корректировку:", err);
    return 0;
  }
}

function applyNavigationBadges(
  menu: NavigationItem[],
  votings: Voting[],
  correctionRequestsCount: number,
): NavigationItem[] {
  const votingCounts = getVotingConstructorBadgeCounts(votings);

  return menu.map((item) => {
    const children = item.children
      ? applyNavigationBadges(item.children, votings, correctionRequestsCount)
      : item.children;

    return {
      ...item,
      unread_count: getNavigationBadgeCount(
        item.code,
        item.unread_count,
        votingCounts,
        correctionRequestsCount,
      ),
      children,
    };
  });
}

function applyCorrectionRequestsBadgeCount(
  menu: NavigationItem[],
  count: number,
): NavigationItem[] {
  return menu.map((item) => ({
    ...item,
    unread_count: item.code === "my_building" ? count : item.unread_count,
    children: item.children
      ? applyCorrectionRequestsBadgeCount(item.children, count)
      : item.children,
  }));
}

function getNavigationBadgeCount(
  code: string,
  currentCount: number | undefined,
  votingCounts: Record<string, number>,
  correctionRequestsCount: number,
) {
  if (code === "my_building") return correctionRequestsCount;
  if (code in votingCounts) return votingCounts[code];

  return currentCount || 0;
}

function getVotingConstructorBadgeCounts(votings: Voting[]) {
  const counts: Record<string, number> = {
    voting_constructor: 0,
    voting_constructor_approval: 0,
    voting_constructor_revision: 0,
    voting_constructor_pending_publication: 0,
    voting_constructor_published: 0,
  };

  for (const voting of votings) {
    if (voting.status === "council_review") {
      counts.voting_constructor_approval += 1;
    }
    if (voting.status === "revision_required") {
      counts.voting_constructor_revision += 1;
    }
    if (voting.status === "pending_publish") {
      counts.voting_constructor_pending_publication += 1;
    }
    if (voting.status === "published") {
      counts.voting_constructor_published += 1;
    }
  }

  counts.voting_constructor =
    counts.voting_constructor_approval +
    counts.voting_constructor_revision +
    counts.voting_constructor_pending_publication +
    counts.voting_constructor_published;

  return counts;
}
