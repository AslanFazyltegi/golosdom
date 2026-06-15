"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import { createMeeting, fetchMeetings } from "@/lib/meetings";
import {
  fetchCommunicationNotificationsForRole,
  fetchCommunicationUnreadCounts,
} from "@/lib/communications";
import { fetchNavigation } from "@/lib/navigation";
import {
  fetchObjects,
  fetchPropertyCorrectionRequests,
  fetchPropertyCorrectionRequestCount,
} from "@/lib/objects";
import { fetchOwners, type MeetingOwner } from "@/lib/owners";
import { fetchProfile, updateProfile as saveProfile } from "@/lib/profile";
import {
  SYSTEM_SETTINGS_CHANGED_EVENT,
  startSystemSettingsSync,
  systemNotificationsEnabled,
} from "@/lib/system-settings";
import { fetchVotings } from "@/lib/votings";
import { roleLabel } from "@/shared/lib/cabinetLabels";
import { addAstanaDays, formatAstanaDateKey } from "@/shared/lib/dateTime";
import { AppButton } from "@/shared/ui/design-system";
import type { CommunicationNotification } from "@/types/communications";
import type { Meeting } from "@/types/meeting";
import type { NavigationItem } from "@/types/navigation";
import type { PropertyCorrectionRequest } from "@/types/objects";
import type { UpdateProfilePayload, UserProfile } from "@/types/profile";
import type { SubmitMeetingOptions } from "@/shared/types/cabinet";
import type { User } from "@/types/user";
import type { Voting } from "@/types/voting";
import { CabinetHeader } from "./CabinetHeader";
import { CabinetSidebar } from "./CabinetSidebar";
import { CabinetWorkspace } from "./CabinetWorkspace";
import { MobileBottomNav } from "./MobileBottomNav";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cabinetModal, setCabinetModal] = useState<"important" | "help" | null>(
    null,
  );
  const [attentionDetails, setAttentionDetails] =
    useState<AttentionDetails | null>(null);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionError, setAttentionError] = useState("");

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

  const baseAttentionItems = useMemo(
    () =>
      buildBaseAttentionItems({
        activeRole,
        correctionRequestsCount: correctionRequestsBadgeCount,
        votings,
      }),
    [activeRole, correctionRequestsBadgeCount, votings],
  );

  const detailedAttentionItems = useMemo(
    () => buildDetailedAttentionItems(baseAttentionItems, attentionDetails),
    [attentionDetails, baseAttentionItems],
  );

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

  useEffect(() => startSystemSettingsSync(), []);

  useEffect(() => {
    function handleSystemSettingsChange() {
      if (!systemNotificationsEnabled()) {
        setMenu((current) => clearCommunicationUnreadCounts(current));
        return;
      }

      void refreshCommunicationUnreadCounts();
    }

    window.addEventListener(
      SYSTEM_SETTINGS_CHANGED_EVENT,
      handleSystemSettingsChange,
    );

    return () =>
      window.removeEventListener(
        SYSTEM_SETTINGS_CHANGED_EVENT,
        handleSystemSettingsChange,
      );
  }, [activeRole]);

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
          role === "OWNER" && systemNotificationsEnabled()
            ? await withCommunicationUnreadCounts(menuData)
            : clearCommunicationUnreadCounts(menuData);
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
    if (activeRole !== "OWNER" || !systemNotificationsEnabled()) {
      setMenu((current) => clearCommunicationUnreadCounts(current));
      return;
    }

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
      role === "OWNER" && systemNotificationsEnabled()
        ? await withCommunicationUnreadCounts(menuData)
        : clearCommunicationUnreadCounts(menuData);
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
    setAccountOpen(false);
    if (!item.children || item.children.length === 0) {
      setSidebarOpen(false);
    }

    if (component.startsWith("meetings")) {
      await loadMeetingsByComponent(component);
    }
  }

  function openAccountModule(code: string) {
    setVotingConstructorInitial(null);
    setActiveComponent(code);
    setAccountOpen(false);
  }

  async function openImportantEvents() {
    setCabinetModal("important");
    setAttentionError("");
    setAttentionDetails(null);

    try {
      setAttentionLoading(true);
      const notificationRequest = systemNotificationsEnabled()
        ? fetchCommunicationNotificationsForRole(resolveNotificationRole(activeRole))
        : Promise.resolve([]);
      const [correctionResult, notificationResult] = await Promise.allSettled([
        loadPendingCorrectionRequests(activeRole),
        notificationRequest,
      ]);

      setAttentionDetails({
        correctionRequests:
          correctionResult.status === "fulfilled" ? correctionResult.value : [],
        notifications:
          notificationResult.status === "fulfilled" ? notificationResult.value : [],
      });

      if (
        correctionResult.status === "rejected" ||
        notificationResult.status === "rejected"
      ) {
        setAttentionError("Часть важных событий не загрузилась.");
      }
    } finally {
      setAttentionLoading(false);
    }
  }

  function openImportantTaskModule(moduleCode: string) {
    openAccountModule(moduleCode);
    setCabinetModal(null);
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

  if (loading) {
    return (
      <main className="gd-app-shell min-h-screen p-6">
        <section className="gd-card mx-auto mt-16 max-w-xl p-6">
          <div className="flex items-center gap-4">
            <div className="gd-skeleton h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="gd-skeleton h-4 w-2/3" />
              <div className="gd-skeleton h-3 w-1/2" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="gd-skeleton h-16" />
            <div className="gd-skeleton h-16" />
            <div className="gd-skeleton h-16" />
          </div>
        </section>
      </main>
    );
  }
  if (!user) return null;

  const activeModuleTitle = getActiveModuleTitle(menu, activeComponent);
  const buildingTitle = getHeaderBuildingTitle(objects);
  const workspaceModal =
    cabinetModal === "important" ? (
      <CabinetWorkspaceModal
        title="Важные события"
        onClose={() => setCabinetModal(null)}
        className="max-w-2xl"
      >
        <ImportantEventsContent
          error={attentionError}
          items={detailedAttentionItems}
          loading={attentionLoading}
          onOpenModule={openImportantTaskModule}
        />
      </CabinetWorkspaceModal>
    ) : cabinetModal === "help" ? (
      <CabinetWorkspaceModal
        title="Помощь"
        onClose={() => setCabinetModal(null)}
        className="max-w-lg"
      >
        <HelpContent
          activeComponent={activeComponent}
          activeModuleTitle={activeModuleTitle}
          activeRole={activeRole}
        />
      </CabinetWorkspaceModal>
    ) : null;

  return (
    <main className="gd-app-shell h-screen overflow-hidden">
      <CabinetHeader
        user={user}
        activeRole={activeRole}
        activeModuleTitle={activeModuleTitle}
        buildingTitle={buildingTitle}
        accountOpen={accountOpen}
        setAccountOpen={setAccountOpen}
        onOpenModule={openAccountModule}
        onOpenHelp={() => setCabinetModal("help")}
        onOpenImportantEvents={() => void openImportantEvents()}
        switchRole={switchRole}
        logout={logout}
        sidebarCollapsed={sidebarCollapsed}
        onToggleDesktopSidebar={() => setSidebarCollapsed((value) => !value)}
        onToggleMobileSidebar={() => {
          setSidebarCollapsed(false);
          setSidebarOpen((value) => !value);
        }}
      />

      <div className="h-screen pt-16">
        <CabinetSidebar
          menu={menu}
          activeComponent={activeComponent}
          expandedMenuCodes={expandedMenuCodes}
          collapsed={sidebarCollapsed}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
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
          sidebarCollapsed={sidebarCollapsed}
          overlay={workspaceModal}
        />
        <MobileBottomNav
          activeComponent={activeComponent}
          menu={menu}
          onOpenItem={(item) => void openNavigationItem(item)}
          onOpenModule={openAccountModule}
        />
      </div>
    </main>
  );
}

type AttentionItem = {
  id: string;
  title: string;
  description: string;
  moduleCode: string;
};

type AttentionDetails = {
  correctionRequests: PropertyCorrectionRequest[];
  notifications: CommunicationNotification[];
};

function CabinetWorkspaceModal({
  children,
  className = "",
  onClose,
  title,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  title: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <section
        className={`gd-modal-panel ${className}`}
        style={{ maxHeight: "calc(100% - 2rem)" }}
      >
        <div className="gd-modal-header">
          <h2 className="text-xl font-bold text-[var(--gd-text-strong)]">
            {title}
          </h2>
          <AppButton variant="secondary" onClick={onClose}>
            Закрыть
          </AppButton>
        </div>
        <div className="gd-modal-body">{children}</div>
      </section>
    </div>
  );
}

function ImportantEventsContent({
  error,
  items,
  loading,
  onOpenModule,
}: {
  error: string;
  items: AttentionItem[];
  loading: boolean;
  onOpenModule: (moduleCode: string) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <p className="text-sm font-semibold text-[var(--gd-muted)]">
        Загрузка...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="gd-alert-danger text-sm">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-[var(--gd-muted)]">
          Важных событий нет
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenModule(item.moduleCode)}
              className="w-full rounded-2xl border border-[var(--gd-border)] bg-[var(--gd-surface-muted)] px-4 py-3 text-left transition hover:bg-[var(--gd-surface)]"
            >
              <span className="block text-sm font-bold text-[var(--gd-text-strong)]">
                {item.title}
              </span>
              <span className="mt-1 block text-sm text-[var(--gd-muted-strong)]">
                {item.description}
              </span>
            </button>
          ))}
        </div>
      )}
      {loading && items.length > 0 && (
        <p className="text-xs font-semibold text-[var(--gd-muted)]">
          Обновляем данные...
        </p>
      )}
    </div>
  );
}

function HelpContent({
  activeComponent,
  activeModuleTitle,
  activeRole,
}: {
  activeComponent: string;
  activeModuleTitle: string;
  activeRole: string;
}) {
  const text = helpTextForRole(activeRole);

  return (
    <div className="space-y-3 text-sm text-[var(--gd-muted-strong)]">
      <p>
        Текущий кабинет:{" "}
        <span className="font-bold text-[var(--gd-text-strong)]">
          {roleLabel(activeRole)}
        </span>
        .
      </p>
      <p>
        Раздел:{" "}
        <span className="font-bold text-[var(--gd-text-strong)]">
          {activeModuleTitle}
        </span>
        .
      </p>
      <p>{text}</p>
      <p>
        Используйте левое меню для перехода между разделами. Доступные действия
        зависят от роли и текущего статуса записей в разделе.
      </p>
      {activeComponent === "dashboard" && (
        <p>На дашборде собраны ключевые показатели и быстрые переходы.</p>
      )}
    </div>
  );
}

function buildBaseAttentionItems({
  activeRole,
  correctionRequestsCount,
  votings,
}: {
  activeRole: string;
  correctionRequestsCount: number;
  votings: Voting[];
}) {
  const items: AttentionItem[] = [];
  if (!isChairmanRole(activeRole)) return items;

  const revisionVotings = votings.filter(
    (voting) => voting.status === "revision_required",
  );
  const pendingPublicationVotings = votings.filter(
    (voting) => voting.status === "pending_publish",
  );

  for (const voting of revisionVotings) {
    items.push({
      id: `revision-${voting.id}`,
      title: voting.title || "Опросник на доработке",
      description: "Опросник на доработке",
      moduleCode: "voting_constructor_revision",
    });
  }

  for (const voting of pendingPublicationVotings) {
    items.push({
      id: `pending-publication-${voting.id}`,
      title: voting.title || "Опросник ожидает публикации",
      description: "Опросник ожидает публикации",
      moduleCode: "voting_constructor_pending_publication",
    });
  }

  if (correctionRequestsCount > 0) {
    items.push({
      id: "correction-requests",
      title: `Заявки на корректировку: ${correctionRequestsCount}`,
      description: "Ожидают обработки",
      moduleCode: "my_building",
    });
  }

  return items;
}

function buildDetailedAttentionItems(
  baseItems: AttentionItem[],
  details: AttentionDetails | null,
) {
  if (!details) return baseItems;

  const items = baseItems.filter((item) => item.id !== "correction-requests");
  const correctionItems = details.correctionRequests
    .filter(isPendingCorrectionRequest)
    .map((request) => ({
      id: `correction-${request.id}`,
      title: correctionRequestTitle(request),
      description: "Заявка на корректировку ожидает обработки",
      moduleCode: "my_building",
    }));
  const notificationItems = details.notifications
    .filter(isProblemNotification)
    .map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.title || "Уведомление",
      description: notificationAttentionDescription(notification),
      moduleCode: "communication_notifications",
    }));

  return [...items, ...correctionItems, ...notificationItems];
}

async function loadPendingCorrectionRequests(activeRole: string) {
  if (!isChairmanRole(activeRole)) return [];

  const data = await fetchPropertyCorrectionRequests();
  return data.requests.filter(isPendingCorrectionRequest);
}

function isChairmanRole(role: string) {
  return role.trim().toUpperCase() === "CHAIRMAN";
}

function isPendingCorrectionRequest(request: PropertyCorrectionRequest) {
  return (
    request.status === "pending" ||
    (!request.processedAt && request.status !== "processed")
  );
}

function correctionRequestTitle(request: PropertyCorrectionRequest) {
  const property = [request.propertyType, request.propertyNumber]
    .filter(Boolean)
    .join(" ");
  return property
    ? `Заявка на корректировку: ${property}`
    : "Заявка на корректировку";
}

function isProblemNotification(notification: CommunicationNotification) {
  return (
    notification.status === "failed" ||
    unsentNotificationStatuses.has(notification.status) ||
    (notification.delivery_stats?.errors ?? 0) > 0
  );
}

function notificationAttentionDescription(notification: CommunicationNotification) {
  const errors = notification.delivery_stats?.errors ?? 0;
  if (errors > 0) return `Ошибки отправки: ${errors}`;
  return `Неотправленное уведомление: ${notificationStatusLabel(
    notification.status,
  )}`;
}

const unsentNotificationStatuses = new Set(["draft", "scheduled", "sending"]);

function notificationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "черновик",
    scheduled: "запланировано",
    sending: "отправляется",
    failed: "ошибка отправки",
  };

  return labels[status] || status;
}

function resolveNotificationRole(activeRole: string) {
  return activeRole === "COUNCIL" ? "COUNCIL_MEMBER" : activeRole;
}

function helpTextForRole(activeRole: string) {
  const normalized = activeRole.trim().toUpperCase();
  const texts: Record<string, string> = {
    OWNER:
      "В кабинете собственника доступны ваши объекты, голосования, собрания и сообщения Инфоцентра.",
    CHAIRMAN:
      "В кабинете председателя доступны управление домом, опросники, собрания, Инфоцентр и обработка заявок.",
    COUNCIL_MEMBER:
      "В кабинете члена совета дома доступны рассмотрение опросников, голосования, собрания и публикации Инфоцентра.",
    AUDITOR:
      "В кабинете ревизора доступны разделы проверки и просмотра данных, открытые для вашей роли.",
    REVISION_MEMBER:
      "В кабинете ревизионной комиссии доступны разделы проверки и просмотра данных, открытые для вашей роли.",
    REVISION_COMMISSION_MEMBER:
      "В кабинете ревизионной комиссии доступны разделы проверки и просмотра данных, открытые для вашей роли.",
  };

  return texts[normalized] || "В кабинете доступны разделы, назначенные вашей роли.";
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

function getActiveModuleTitle(menu: NavigationItem[], activeComponent: string) {
  const item = flattenMenu(menu).find(
    (menuItem) => getModuleCode(menuItem) === activeComponent,
  );
  if (item?.title) return item.title;

  const accountTitles: Record<string, string> = {
    profile: "Профиль",
    system_settings: "Настройки",
  };

  return accountTitles[activeComponent] || "Кабинет";
}

function getHeaderBuildingTitle(objects: unknown) {
  if (!objects || Array.isArray(objects)) return "Bizdin Ui";

  const building = objects as Record<string, unknown>;
  const name = [building.building_name, building.street, building.house_number]
    .filter(Boolean)
    .join(", ");

  return name || "Bizdin Ui";
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
    unread_count:
      item.code in codeToCount ? codeToCount[item.code] || 0 : item.unread_count,
    children: item.children
      ? applyCommunicationUnreadCounts(item.children, counts)
      : item.children,
  }));
}

function clearCommunicationUnreadCounts(menu: NavigationItem[]): NavigationItem[] {
  return menu.map((item) => ({
    ...item,
    unread_count: isCommunicationItem(item)
      ? 0
      : item.unread_count,
    children: item.children
      ? clearCommunicationUnreadCounts(item.children)
      : item.children,
  }));
}

function isCommunicationItem(item: NavigationItem) {
  return item.code.startsWith("communication_") || item.code === "notifications";
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
