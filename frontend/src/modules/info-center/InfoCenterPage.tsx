"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  searchOwners,
  type OwnerSearchResult,
} from "@/lib/owners";
import {
  deleteCommunicationPost,
  fetchCommunicationNotificationReport,
  fetchCommunicationNotificationsForRole,
  fetchCommunicationPosts,
  markCommunicationNotificationRead,
  markCommunicationPostRead,
  permanentDeleteCommunicationNotification,
  runCommunicationNotificationAction,
  saveCommunicationPost,
  sendCommunicationNotification,
  updateCommunicationNotification,
} from "@/lib/communications";
import { formatAstanaDateTime } from "@/shared/lib/dateTime";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import type {
  CommunicationChannel,
  CommunicationDelivery,
  CommunicationNotification,
  CommunicationPost,
  CommunicationTarget,
} from "@/types/communications";
import { InfocenterRichTextEditor } from "../infocenter/shared/InfocenterRichTextEditor";

type PostKind = "news" | "announcement";
type OwnerFilter = "all" | "unread" | "important";
type ChairmanFilter = "all" | "draft" | "published" | "hidden" | "scheduled" | "deleted";

const chairmanFilters: { value: ChairmanFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновики" },
  { value: "published", label: "Опубликованные" },
  { value: "hidden", label: "Скрытые" },
  { value: "scheduled", label: "Запланированные" },
  { value: "deleted", label: "Удалённые" },
];

const ownerFilters: { value: OwnerFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "unread", label: "Непрочитанные" },
  { value: "important", label: "Важные" },
];

const emptyPostForm = (type: PostKind): Partial<CommunicationPost> => ({
  type,
  title: "",
  body: "",
  image_url: "",
  status: "draft",
  importance: "normal",
  is_pinned: false,
  targets: [{ type: "all", value: "" }],
  channels: [{ channel: "portal", enabled: true }],
});

const emptyNotificationForm = (): Partial<CommunicationNotification> => ({
  title: "",
  body: "",
  targets: [{ type: "all", value: "" }],
  channels: [
    { channel: "portal", enabled: true },
    { channel: "whatsapp", enabled: false },
    { channel: "sms", enabled: false },
  ],
});

export function InfoCenterPage(props: CabinetModuleProps) {
  const { activeComponent, activeRole } = props;
  const isChairman = activeRole === "CHAIRMAN";

  if (activeComponent === "communication_deliveries") {
    return <ChairmanNotifications {...props} />;
  }

  if (activeComponent === "communication_notifications") {
    return isChairman ? (
      <ChairmanNotifications {...props} />
    ) : (
      <OwnerNotifications {...props} />
    );
  }

  const type: PostKind =
    activeComponent === "communication_announcements" ? "announcement" : "news";
  return isChairman ? (
    <ChairmanPosts key={type} {...props} type={type} />
  ) : (
    <OwnerPosts key={type} {...props} type={type} />
  );
}

function ChairmanPosts({
  type,
  owners,
  activeRole,
}: CabinetModuleProps & { type: PostKind }) {
  const [posts, setPosts] = useState<CommunicationPost[]>([]);
  const [filter, setFilter] = useState<ChairmanFilter>("all");
  const [form, setForm] = useState<Partial<CommunicationPost>>(emptyPostForm(type));
  const [editingID, setEditingID] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const title = type === "news" ? "Новости" : "Объявления";

  async function load() {
    const data = await fetchCommunicationPosts(type, filter, activeRole);
    setPosts(data);
  }

  useEffect(() => {
    fetchCommunicationPosts(type, filter, activeRole)
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, [type, filter, activeRole]);

  async function submit(status: CommunicationPost["status"]) {
    setError("");
    setSaving(true);
    try {
      await saveCommunicationPost({ ...form, type, status }, editingID || undefined);
      setForm(emptyPostForm(type));
      setEditingID(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  function edit(post: CommunicationPost) {
    setEditingID(post.id);
    setForm(post);
  }

  return (
    <main className="gd-infocenter-page min-h-full">
      <Header title={title} text="Управление публикациями для собственников." />
      <FilterBar
        items={chairmanFilters}
        value={filter}
        onChange={(value) => setFilter(value as ChairmanFilter)}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canManage
              onEdit={() => edit(post)}
              onDelete={async () => {
                await deleteCommunicationPost(post.id);
                await load();
              }}
              onStatus={async (status) => {
                await saveCommunicationPost({ ...post, status }, post.id);
                await load();
              }}
            />
          ))}
          {posts.length === 0 && <EmptyState text="Материалов пока нет." />}
        </section>

        <PostForm
          type={type}
          form={form}
          owners={owners}
          saving={saving}
          editing={Boolean(editingID)}
          error={error}
          setForm={setForm}
          onPublish={() => submit("published")}
          onDraft={() => submit("draft")}
          onCancel={() => {
            setEditingID(null);
            setForm(emptyPostForm(type));
          }}
        />
      </div>
    </main>
  );
}

function OwnerPosts({
  type,
  activeRole,
  refreshCommunicationUnreadCounts,
}: CabinetModuleProps & { type: PostKind }) {
  const [posts, setPosts] = useState<CommunicationPost[]>([]);
  const [selected, setSelected] = useState<CommunicationPost | null>(null);
  const [filter, setFilter] = useState<OwnerFilter>("all");
  const [error, setError] = useState("");

  const title = type === "news" ? "Новости" : "Объявления";

  async function load() {
    const data = await fetchCommunicationPosts(type, "all", activeRole);
    setPosts(data);
  }

  useEffect(() => {
    fetchCommunicationPosts(type, "all", activeRole)
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, [type, activeRole]);

  const visiblePosts = useMemo(() => {
    return posts.filter((post) => {
      if (filter === "unread") return !post.read_at;
      if (filter === "important") return post.importance !== "normal" || post.is_pinned;
      return true;
    });
  }, [filter, posts]);

  async function openPost(post: CommunicationPost) {
    setSelected(post);
    if (!post.read_at) {
      await markCommunicationPostRead(post.id);
      await load();
      await refreshCommunicationUnreadCounts?.();
    }
  }

  return (
    <main className="gd-infocenter-page min-h-full">
      <Header title={title} text="Материалы, опубликованные для вашего объекта." />
      <FilterBar
        items={ownerFilters}
        value={filter}
        onChange={(value) => setFilter(value as OwnerFilter)}
      />
      {error && <ErrorText text={error} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          {visiblePosts.map((post) => (
            <PostCard key={post.id} post={post} onOpen={() => openPost(post)} />
          ))}
          {visiblePosts.length === 0 && <EmptyState text="Доступных материалов пока нет." />}
        </section>
        {selected ? <PostDetails post={selected} /> : <EmptyState text="Откройте материал из списка." />}
      </div>
    </main>
  );
}

function ChairmanNotifications({ owners, activeRole }: CabinetModuleProps) {
  const [items, setItems] = useState<CommunicationNotification[]>([]);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [audience, setAudience] = useState("all");
  const [sort, setSort] = useState("newest");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<{ mode: "create" | "edit"; item?: CommunicationNotification } | null>(null);
  const [details, setDetails] = useState<CommunicationNotification | null>(null);
  const [report, setReport] = useState<CommunicationNotification | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchCommunicationNotificationsForRole(activeRole, { status: tab, search, category, audience, sort }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      try {
        const data = await fetchCommunicationNotificationsForRole(activeRole, { status: tab, search, category, audience, sort });
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeRole, tab, sort]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchCommunicationNotificationsForRole(activeRole, { status: tab, search, category, audience, sort })
        .then(setItems)
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeRole, audience, category, search, sort, tab]);

  return (
    <main className="gd-infocenter-page min-h-full">
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="gd-page-kicker text-sm font-semibold">Инфоцентр / Уведомления</p>
            <h1 className="gd-page-title mt-1">Уведомления</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="gd-button">
              Обновить
            </button>
            <button onClick={() => setDrawer({ mode: "create" })} className="gd-button gd-button-primary">
              + Создать уведомление
            </button>
          </div>
        </div>

        <FilterBar items={[
          { value: "all", label: "Все" },
          { value: "draft", label: "Черновики" },
          { value: "scheduled", label: "Запланированы" },
          { value: "sent", label: "Опубликованы" },
          { value: "hidden", label: "Скрытые" },
          { value: "completed", label: "Завершенные" },
          { value: "deleted", label: "Удаленные" },
        ]} value={tab} onChange={setTab} />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
          className="gd-filter-panel grid gap-3 lg:grid-cols-[1fr_190px_190px_150px]"
        >
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="gd-input" placeholder="Поиск по заголовку или тексту..." />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="gd-input">
            <option value="all">Все категории</option>
            {notificationCategories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className="gd-input">
            <option value="all">Все аудитории</option>
            <option value="all">Все собственники</option>
            <option value="role">ОСИ / роли</option>
            <option value="user">Отдельные пользователи</option>
            <option value="property_type">По типу объекта</option>
          </select>
          <button className="gd-button">Фильтры</button>
        </form>

        <div className="mb-4 flex justify-end">
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="gd-input max-w-64 font-semibold">
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="title">По заголовку</option>
            <option value="delivery">По доставке</option>
            <option value="read">По прочтению</option>
          </select>
        </div>

        {error && <ErrorText text={error} />}
        {success && <p className="gd-alert gd-alert-success mb-4">{success}</p>}
        {loading && <p className="gd-muted-panel mb-4 px-4 py-3 text-sm">Загрузка...</p>}
        <section className="gd-card overflow-visible p-0">
          <div className="grid grid-cols-[1.35fr_1fr_0.8fr_1fr_0.8fr_0.8fr_0.9fr_56px] gap-3 border-b border-[var(--gd-border)] bg-[var(--gd-surface-muted)] px-5 py-3 text-xs font-bold uppercase tracking-wide text-[var(--gd-muted)]">
            <span>Заголовок</span>
            <span>Аудитория</span>
            <span>Каналы</span>
            <span>Дата отправки</span>
            <span>Доставка</span>
            <span>Прочтение</span>
            <span>Статус</span>
            <span />
          </div>
          {items.map((item) => (
            <NotificationTableRow
              key={item.id}
              item={item}
              onOpen={() => setDetails(item)}
              onEdit={() => setDrawer({ mode: "edit", item })}
              onReport={() => setReport(item)}
              onDone={load}
            />
          ))}
          {items.length === 0 && !loading && <div className="p-8 text-sm text-[var(--gd-muted)]">Уведомления не найдены.</div>}
        </section>
      </div>
      {drawer && (
        <NotificationDrawer
          state={drawer}
          owners={owners}
          onClose={() => setDrawer(null)}
          onSaved={async (message) => {
            setDrawer(null);
            setSuccess(message);
            await load();
          }}
        />
      )}
      {details && <NotificationDetails item={details} onClose={() => setDetails(null)} onEdit={() => { setDrawer({ mode: "edit", item: details }); setDetails(null); }} onReport={() => { setReport(details); setDetails(null); }} />}
      {report && <NotificationReport item={report} onClose={() => setReport(null)} />}
    </main>
  );
}

const notificationCategories = ["Общее", "Сервис", "Аварийное", "Платежи", "Собрание"];
const portalChannels: CommunicationChannel["channel"][] = ["portal", "whatsapp", "sms"];
const notificationAudienceOptions = [
  { value: "all_owners", label: "Все собственники", targets: [{ type: "all" as const, value: "" }] },
  {
    value: "apartments_commercial",
    label: "Квартиры и нежилые помещения",
    targets: [
      { type: "property_type" as const, value: "apartment" },
      { type: "property_type" as const, value: "commercial_room" },
    ],
  },
  {
    value: "storage_parking",
    label: "Кладовые и паркоместа",
    targets: [
      { type: "property_type" as const, value: "storage" },
      { type: "property_type" as const, value: "parking" },
    ],
  },
  { value: "individual_owners", label: "Отдельный собственник", targets: [] },
];

function NotificationTableRow({
  item,
  onOpen,
  onEdit,
  onReport,
  onDone,
}: {
  item: CommunicationNotification;
  onOpen: () => void;
  onEdit: () => void;
  onReport: () => void;
  onDone: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const stats = item.delivery_stats || { recipients: 0, delivered: 0, read: 0, errors: 0 };
  const status = notificationStatus(item);

  async function action(name: string) {
    setMenuOpen(false);
    if (name === "edit") return onEdit();
    if (name === "open") return onOpen();
    if (name === "report") return onReport();
    if (name === "permanent") await permanentDeleteCommunicationNotification(item.id);
    else await runCommunicationNotificationAction(item.id, name);
    await onDone();
  }

  return (
    <div onClick={onOpen} className="grid cursor-pointer grid-cols-[1.35fr_1fr_0.8fr_1fr_0.8fr_0.8fr_0.9fr_56px] gap-3 border-b border-[var(--gd-border)] px-5 py-4 text-sm last:border-b-0 hover:bg-[var(--gd-surface-muted)]">
      <div className="min-w-0">
        <p className="truncate font-bold text-[var(--gd-text-strong)]">{item.title}</p>
        <p className="mt-1 line-clamp-1 text-xs text-[var(--gd-muted)]">{stripHtml(item.body_html || item.body)}</p>
      </div>
      <span className="text-[var(--gd-muted-strong)]">
        {audienceLabelByKey(audienceKeyFromTargets(item.targets))}
        {typeof item.delivery_stats?.recipients === "number" && <small className="mt-1 block text-xs text-[var(--gd-muted)]">{item.delivery_stats.recipients} получателей</small>}
      </span>
      <span className="flex flex-wrap gap-1">{enabledChannels(item).map((channel) => <Pill key={channel}>{channelLabel(channel)}</Pill>)}</span>
      <span className="text-[var(--gd-muted-strong)]">{item.sent_at || item.scheduled_at ? formatAstanaDateTime(item.sent_at || item.scheduled_at || "") : "сразу после публикации"}</span>
      <span className="font-semibold text-[var(--gd-text)]">Доставлено: {stats.delivered}/{stats.recipients}</span>
      <span className="font-semibold text-[var(--gd-text)]">Прочитано: {stats.read}/{stats.recipients}</span>
      <span><StatusBadge status={status} /></span>
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <button onClick={() => setMenuOpen((value) => !value)} className="gd-button px-3 py-2 text-lg leading-none">⋮</button>
        {menuOpen && (
          <div className="absolute right-0 top-11 z-20 w-64 overflow-hidden rounded-[var(--gd-radius-md)] border border-[var(--gd-border)] bg-[var(--gd-surface)] py-2 shadow-lg">
            {notificationActions(item).map((itemAction) => (
              <button key={itemAction.key} onClick={() => void action(itemAction.key)} className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--gd-surface-muted)]">
                {itemAction.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationDrawer({
  state,
  owners,
  onClose,
  onSaved,
}: {
  state: { mode: "create" | "edit"; item?: CommunicationNotification };
  owners: CabinetModuleProps["owners"];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const item = state.item;
  const [form, setForm] = useState<Partial<CommunicationNotification>>(() => item ? {
    title: item.title,
    body: item.body,
    body_html: item.body_html || item.body,
    status: item.status,
    category: item.category || notificationCategories[0],
    scheduled_at: item.scheduled_at || null,
    targets: item.targets,
    channels: item.channels,
  } : { ...emptyNotificationForm(), body_html: "", category: notificationCategories[0], status: "draft" });
  const [audienceType, setAudienceType] = useState(() => audienceKeyFromTargets(item?.targets || [{ type: "all", value: "" }]));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [missingOwners, setMissingOwners] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const validAudience = audienceType !== "individual_owners" || (form.targets || []).some((target) => target.type === "user" && target.value);
  const valid = Boolean(form.title?.trim() && stripHtml(form.body_html || "").trim() && (form.targets || []).length > 0 && validAudience && enabledChannels(form).length > 0);
  const publicationMinDateTime = getTodayDateTimeMinValue();

  async function save(mode: "draft" | "send") {
    if (audienceType === "individual_owners" && !validAudience) {
      setError("Выберите хотя бы одного собственника из БД");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (missingOwners.length > 0) {
        setError(`Собственник не найден в БД: ${missingOwners.join(", ")}.`);
        setSaving(false);
        return;
      }
      const payload = { ...form, body: stripHtml(form.body_html || ""), body_html: form.body_html || "" };
      if (item) await updateCommunicationNotification(item.id, payload, mode);
      else await sendCommunicationNotification(payload, mode);
      await onSaved(mode === "send" ? "Уведомление отправлено." : "Уведомление сохранено.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить уведомление");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <aside className="h-full w-full max-w-4xl overflow-hidden border-l border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--gd-border)] px-7 py-5">
          <div>
            <p className="gd-page-kicker text-sm font-medium">Инфоцентр / Уведомления</p>
            <h2 className="text-2xl font-bold text-[var(--gd-text-strong)]">{item ? "Редактировать уведомление" : "Создать уведомление"}</h2>
          </div>
          <button onClick={onClose} className="gd-button px-3 py-2">✕</button>
        </div>
        <div className="h-[calc(100%-156px)] overflow-y-auto bg-[var(--gd-surface-muted)] px-7 py-6">
          {error && <ErrorText text={error} />}
          <section className="gd-card p-5">
            <Field label="Заголовок уведомления *">
              <input value={form.title || ""} onChange={(event) => setForm({ ...form, title: event.target.value })} className="gd-input" />
            </Field>
            <Field label="Текст уведомления *">
              <InfocenterRichTextEditor value={form.body_html || ""} onChange={(html) => setForm({ ...form, body_html: html, body: stripHtml(html) })} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Категория">
                <select value={form.category || notificationCategories[0]} onChange={(event) => setForm({ ...form, category: event.target.value })} className="gd-input">
                  {notificationCategories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Дата отправки">
                <input type="datetime-local" min={publicationMinDateTime} value={toLocalInput(form.scheduled_at)} onChange={(event) => setForm({ ...form, scheduled_at: fromLocalInput(event.target.value) })} className="gd-input" />
              </Field>
            </div>
            <NotificationAudiencePicker
              targets={form.targets || []}
              audienceType={audienceType}
              onAudienceTypeChange={setAudienceType}
              owners={owners}
              missingOwners={missingOwners}
              onMissingOwnersChange={setMissingOwners}
              onChange={(targets) => setForm({ ...form, targets })}
            />
            <ChannelPicker channels={form.channels || []} allowed={portalChannels} onChange={(channels) => setForm({ ...form, channels })} />
          </section>
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--gd-border)] bg-[var(--gd-surface)] px-7 py-4">
          <div className="mr-auto text-sm font-medium text-[var(--gd-muted)]">{valid ? "Готово к отправке" : "Заполните обязательные поля"}</div>
          <button onClick={onClose} className="gd-button">Отмена</button>
          <button disabled={saving || !valid} onClick={() => void save("draft")} className="gd-button">Сохранить как черновик</button>
          <button disabled={!valid} onClick={() => setPreviewOpen(true)} className="gd-button gd-button-primary">Предпросмотр</button>
          
        </div>
      </aside>
      {previewOpen && (
  <NotificationPreview
    form={form}
    audienceType={audienceType}
    missingOwners={missingOwners}
    onClose={() => setPreviewOpen(false)}
    saving={saving}
    valid={valid}
    onSend={() => void save("send")}
  />
)}
    </div>
  );
}

function NotificationAudiencePicker({
  targets,
  audienceType,
  onAudienceTypeChange,
  owners,
  missingOwners,
  onMissingOwnersChange,
  onChange,
}: {
  targets: CommunicationTarget[];
  audienceType: string;
  onAudienceTypeChange: (value: string) => void;
  owners: CabinetModuleProps["owners"];
  missingOwners: string[];
  onMissingOwnersChange: (items: string[]) => void;
  onChange: (targets: CommunicationTarget[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const selectedOwners = targets.filter((target) => target.type === "user" && target.value);
  const selectedKey = (target: CommunicationTarget) => `${target.type}:${target.value}`;
  const selected = new Set(targets.map(selectedKey));

  useEffect(() => {
    if (audienceType !== "individual_owners" || !open) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSearchLoading(true);
      searchOwners(manual.trim())
        .then((items) => {
          if (!cancelled) {
            setOwnerOptions(items);
            setSearchError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setSearchError(err instanceof Error ? err.message : "Не удалось найти собственников");
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [audienceType, open, manual]);

  function setAudience(value: string) {
    const option = notificationAudienceOptions.find((item) => item.value === value);
    onAudienceTypeChange(value);
    onMissingOwnersChange([]);
    setManual("");
    setOpen(false);
    setDuplicateMessage("");
    onChange(option?.targets || []);
  }

  function addOwner(owner: OwnerSearchResult) {
    const target = { type: "user" as const, value: owner.user_id };
    if (selected.has(selectedKey(target))) {
      setDuplicateMessage("Этот собственник уже выбран");
      return;
    }
    setDuplicateMessage("");
    onChange([...selectedOwners, target]);
  }

  function markMissing(value: string) {
    if (!value || missingOwners.includes(value)) return;
    onMissingOwnersChange([...missingOwners, value]);
  }

  function addManual() {
    const value = manual.trim();
    if (!value) return;
    const exactOwner = ownerOptions.find((owner) => ownerSearchResultText(owner).includes(value.toLowerCase()));
    if (exactOwner) addOwner(exactOwner);
    else markMissing(value);
    setManual("");
  }

  return (
    <Field label="Аудитория *">
      <select value={audienceType} onChange={(event) => setAudience(event.target.value)} className="gd-input">
        {notificationAudienceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {audienceType === "individual_owners" && (
        <div className="relative mt-3 flex min-h-14 flex-wrap items-center gap-2 rounded-[var(--gd-radius-sm)] border border-[var(--gd-border)] bg-[var(--gd-surface)] p-2 pr-44">
          {selectedOwners.map((target) => <span key={selectedKey(target)} className="gd-status-pill gd-status-slate flex items-center gap-2">{targetLabel(target, owners)}<button type="button" onClick={() => onChange(selectedOwners.filter((item) => selectedKey(item) !== selectedKey(target)))} className="text-[var(--gd-muted)] hover:text-[var(--gd-danger)]">×</button></span>)}
          {missingOwners.map((value) => <span key={value} className="gd-status-pill gd-status-red flex items-center gap-2">{value}<button type="button" onClick={() => onMissingOwnersChange(missingOwners.filter((item) => item !== value))} className="text-[var(--gd-danger)]">×</button></span>)}
          <input
            value={manual}
            onChange={(event) => {
              setManual(event.target.value);
              setOpen(true);
            }}
            onBlur={() => window.setTimeout(addManual, 120)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addManual();
              }
            }}
            className="min-w-44 flex-1 border-0 bg-transparent px-2 py-2 text-sm outline-none"
            placeholder="Имя, email, телефон или номер объекта"
          />
          <button type="button" onClick={() => setOpen((value) => !value)} className="gd-button absolute right-2 top-2 min-h-0 px-4 py-2">Выбрать из списка⌄</button>
          {open && (
            <div className="absolute right-0 top-14 z-30 w-96 rounded-[var(--gd-radius-md)] border border-[var(--gd-border)] bg-[var(--gd-surface)] p-3 shadow-xl">
              <p className="mb-2 text-sm font-bold text-[var(--gd-text-strong)]">Собственники:</p>
              <div className="max-h-[320px] overflow-y-auto pr-1">
                {searchLoading && <p className="px-3 py-2 text-sm text-[var(--gd-muted)]">Поиск...</p>}
                {ownerOptions.map((owner) => {
                  const target = { type: "user" as const, value: owner.user_id };
                  const ownerSelected = selected.has(selectedKey(target));
                  return (
                    <button key={owner.user_id} type="button" disabled={ownerSelected} onClick={() => { addOwner(owner); setManual(""); setOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${ownerSelected ? "cursor-not-allowed text-[var(--gd-muted)]" : "text-[var(--gd-text)] hover:bg-[var(--gd-primary-soft)]"}`}>
                      {owner.label}
                    </button>
                  );
                })}
                {!searchLoading && ownerOptions.length === 0 && <p className="px-3 py-2 text-sm text-[var(--gd-danger)]">Собственник не найден в БД</p>}
              </div>
            </div>
          )}
        </div>
      )}
      {missingOwners.length > 0 && <p className="mt-2 text-sm text-[var(--gd-danger)]">Собственник не найден в БД: {missingOwners.join(", ")}</p>}
      {duplicateMessage && <p className="mt-2 text-sm text-[var(--gd-warning)]">{duplicateMessage}</p>}
      {searchError && <p className="mt-2 text-sm text-[var(--gd-danger)]">{searchError}</p>}
    </Field>
  );
}

function NotificationPreview({
  form,
  audienceType,
  missingOwners,
  onClose,
  saving,
  valid,
  onSend,
}: {
  form: Partial<CommunicationNotification>;
  audienceType: string;
  missingOwners: string[];
  onClose: () => void;
  saving: boolean;
  valid: boolean;
  onSend: () => void;
}) {
  const validOwners = (form.targets || []).filter((target) => target.type === "user" && target.value).length;
  return (
    <Modal title="Предпросмотр уведомления" onClose={onClose} wide>
      <article className="gd-card">
        <Pill>Уведомление</Pill>
        <h2 className="mt-4 text-3xl font-bold text-[var(--gd-text-strong)]">{form.title}</h2>
        <div className="infocenter-document-content mt-5" dangerouslySetInnerHTML={{ __html: form.body_html || "" }} />
        <div className="gd-muted-panel mt-5 grid gap-3 p-4 text-sm md:grid-cols-2">
          <Meta label="Аудитория" value={audienceLabelByKey(audienceType)} />
          {audienceType === "individual_owners" && <Meta label="Выбрано собственников" value={String(validOwners)} />}
          <Meta label="Каналы" value={enabledChannels(form).map(channelLabel).join(", ") || "Не выбраны"} />
          <Meta label="Дата отправки" value={form.scheduled_at ? formatAstanaDateTime(form.scheduled_at) : "сразу после публикации"} />
        </div>
        {missingOwners.length > 0 && (
          <p className="gd-alert gd-alert-danger mt-4">
            Не найдены в БД: {missingOwners.join(", ")}. Им уведомление не будет отправлено.
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[var(--gd-border)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="gd-button"
          >
            Назад к редактированию
          </button>

          <button
            type="button"
            disabled={saving || !valid}
            onClick={onSend}
            className="gd-button gd-button-primary"
          >
            Отправить уведомление
          </button>
        </div>
      </article>
    </Modal>
  );
}


function NotificationDetails({ item, onClose, onEdit, onReport }: { item: CommunicationNotification; onClose: () => void; onEdit: () => void; onReport: () => void }) {
  const stats = item.delivery_stats || { recipients: 0, delivered: 0, read: 0 };
  return (
    <Modal title="Просмотр уведомления" onClose={onClose} wide>
      <article>
        <StatusBadge status={notificationStatus(item)} />
        <h2 className="mt-4 text-3xl font-bold text-[var(--gd-text-strong)]">{item.title}</h2>
        <div className="infocenter-document-content mt-5" dangerouslySetInnerHTML={{ __html: item.body_html || item.body }} />
        <div className="gd-muted-panel mt-5 grid gap-3 p-4 text-sm md:grid-cols-2">
          <Meta label="Аудитория" value={targetSummary(item)} />
          <Meta label="Каналы" value={enabledChannels(item).map(channelLabel).join(", ")} />
          <Meta label="Дата отправки" value={item.sent_at || item.scheduled_at ? formatAstanaDateTime(item.sent_at || item.scheduled_at || "") : "сразу после публикации"} />
          <Meta label="Статус" value={statusText(notificationStatus(item))} />
          <Meta label="Доставлено" value={`${stats.delivered}/${stats.recipients}`} />
          <Meta label="Прочитано" value={`${stats.read}/${stats.recipients}`} />
        </div>
      </article>
      <div className="mt-5 flex justify-end gap-2">
        {item.status !== "deleted" && <button onClick={onEdit} className="gd-button">Редактировать</button>}
        <button onClick={onReport} className="gd-button">Отчёт о доставке и прочтении</button>
        <button onClick={onClose} className="gd-button gd-button-primary">Закрыть</button>
      </div>
    </Modal>
  );
}

function NotificationReport({ item, onClose }: { item: CommunicationNotification; onClose: () => void }) {
  const [items, setItems] = useState<CommunicationDelivery[]>([]);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCommunicationNotificationReport(item.id).then(setItems).catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки отчёта"));
  }, [item.id]);

  const rows = useMemo(() => groupReportRows(items).filter((row) => {
    const query = search.toLowerCase().trim();
    const matchesSearch = !query || row.recipient.toLowerCase().includes(query) || row.object.toLowerCase().includes(query);
    const matchesChannel = channel === "all" || row.channels[channel]?.status;
    const matchesStatus = status === "all" || finalRecipientStatus(row) === status;
    return matchesSearch && matchesChannel && matchesStatus;
  }), [items, search, channel, status]);
  const stats = item.delivery_stats || { recipients: 0, delivered: 0, read: 0, errors: 0 };

  function exportCSV() {
    const header = ["Получатель", "Объект", "Портал", "WhatsApp", "SMS", "Итог", "Дата прочтения"];
    const csv = [header, ...rows.map((row) => [row.recipient, row.object, channelStatusLabel(row.channels.portal?.status), channelStatusLabel(row.channels.whatsapp?.status), channelStatusLabel(row.channels.sms?.status), statusText(finalRecipientStatus(row)), row.readAt ? formatAstanaDateTime(row.readAt) : ""])].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `notification-${item.id}-report.csv`;
    link.click();
  }

  return (
    <Modal title="Отчёт о доставке и прочтении" onClose={onClose} wide>
      <h3 className="text-xl font-bold text-[var(--gd-text-strong)]">{item.title}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Stat label="Получателей" value={String(stats.recipients)} />
        <Stat label="Доставлено" value={`${stats.delivered}/${stats.recipients}`} />
        <Stat label="Прочитано" value={`${stats.read}/${stats.recipients}`} />
        <Stat label="Ошибки" value={String(stats.errors)} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_160px_160px_140px]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по получателю или объекту" className="gd-input" />
        <select value={channel} onChange={(event) => setChannel(event.target.value)} className="gd-input"><option value="all">Все каналы</option><option value="portal">Портал</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="gd-input"><option value="all">Все статусы</option><option value="read">Прочитано</option><option value="delivered">Доставлено</option><option value="sent">Отправлено</option><option value="failed">Ошибка</option></select>
        <button onClick={exportCSV} className="gd-button">Экспорт CSV</button>
      </div>
      {error && <ErrorText text={error} />}
      <section className="mt-5 overflow-hidden rounded-[var(--gd-radius-md)] border border-[var(--gd-border)]">
        <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr] gap-3 bg-[var(--gd-surface-muted)] px-4 py-3 text-xs font-bold text-[var(--gd-muted)]">
          <span>Получатель</span><span>Объект</span><span>Портал</span><span>WhatsApp</span><span>SMS</span><span>Итог</span><span>Дата прочтения</span>
        </div>
        {rows.map((row) => <div key={row.userID} className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr] gap-3 border-t border-[var(--gd-border)] px-4 py-3 text-sm"><span>{row.recipient}</span><span>{row.object || "Не указан"}</span><span>{channelStatusLabel(row.channels.portal?.status)}</span><span>{channelStatusLabel(row.channels.whatsapp?.status)}</span><span>{channelStatusLabel(row.channels.sms?.status)}</span><span><StatusBadge status={finalRecipientStatus(row)} /></span><span>{row.readAt ? formatAstanaDateTime(row.readAt) : "—"}</span></div>)}
      </section>
    </Modal>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="gd-status-pill gd-status-blue">{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="gd-muted-panel p-4"><p className="text-xs font-semibold text-[var(--gd-muted)]">{label}</p><p className="mt-1 text-2xl font-black text-[var(--gd-text-strong)]">{value}</p></div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <span className="block"><b className="text-[var(--gd-text-strong)]">{label}:</b> {value}</span>;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="gd-modal-overlay z-[70]">
      <section className={`gd-modal-panel ${wide ? "max-w-6xl" : "max-w-lg"}`}>
        <div className="gd-modal-header">
          <h2 className="text-2xl font-bold text-[var(--gd-text-strong)]">{title}</h2>
          <button onClick={onClose} className="gd-button">Закрыть</button>
        </div>
        <div className="gd-modal-body max-h-[72vh] overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

type ReportRow = {
  userID: string;
  recipient: string;
  object: string;
  readAt?: string | null;
  channels: Record<string, CommunicationDelivery>;
};

function groupReportRows(items: CommunicationDelivery[]): ReportRow[] {
  const map = new Map<string, ReportRow>();
  items.forEach((item) => {
    const row = map.get(item.user_id) || { userID: item.user_id, recipient: item.recipient, object: item.property_label || "", readAt: null, channels: {} };
    row.channels[item.channel] = item;
    if (item.read_at) row.readAt = item.read_at;
    map.set(item.user_id, row);
  });
  return Array.from(map.values());
}

function enabledChannels(item: Partial<CommunicationNotification>) {
  return (item.channels || []).filter((channel) => channel.enabled).map((channel) => channel.channel).filter((channel) => channel !== "telegram");
}

function targetSummary(item: CommunicationNotification) {
  const audienceKey = audienceKeyFromTargets(item.targets);
  return audienceLabelByKey(audienceKey);
}

function targetLabel(target: CommunicationTarget, owners: CabinetModuleProps["owners"]) {
  if (target.type === "all") return "Собственники по дому";
  if (target.type === "role" && target.value === "CHAIRMAN") return "Председатель ОСИ";
  if (target.type === "role" && target.value === "COUNCIL_MEMBER") return "Совет дома";
  if (target.type === "property_type") return target.value === "apartment" ? "Владельцы квартир" : target.value;
  if (target.type === "user") {
    const owner = owners.find((item) => item.id === target.value);
    return owner ? `${owner.full_name} (${owner.property_number})` : target.value;
  }
  return target.value || target.type;
}

function ownerLabel(owner: CabinetModuleProps["owners"][number]) {
  return `${owner.full_name} (${owner.property_number})`;
}

function ownerSearchText(owner: CabinetModuleProps["owners"][number]) {
  return [owner.full_name, owner.email, owner.phone, owner.property_number].filter(Boolean).join(" ").toLowerCase();
}

function ownerSearchResultText(owner: OwnerSearchResult) {
  return [owner.label, owner.name, owner.email, owner.phone, ...owner.properties].filter(Boolean).join(" ").toLowerCase();
}

function audienceKeyFromTargets(targets: CommunicationTarget[]) {
  const keys = new Set(targets.map((target) => `${target.type}:${target.value}`));
  if (keys.has("all:")) return "all_owners";
  if (keys.has("role:COUNCIL_MEMBER")) return "council_members";
  if (keys.has("property_type:apartment") && keys.has("property_type:commercial_room")) return "apartments_commercial";
  if (keys.has("property_type:storage") && keys.has("property_type:parking")) return "storage_parking";
  if (targets.some((target) => target.type === "user")) return "individual_owners";
  return "all_owners";
}

function audienceLabelByKey(value: string) {
  return notificationAudienceOptions.find((option) => option.value === value)?.label || "Все собственники";
}

function notificationActions(item: CommunicationNotification) {
  if (item.status === "deleted") {
    return [
      { key: "open", label: "Просмотреть" },
      { key: "restore", label: "Восстановить" },
      { key: "permanent", label: "Удалить навсегда" },
    ];
  }
  return [
    { key: "open", label: "Просмотреть" },
    { key: "edit", label: "Редактировать" },
    { key: "report", label: "Отчёт о доставке и прочтении" },
    { key: item.status === "hidden" ? "show" : "hide", label: item.status === "hidden" ? "Показать" : "Скрыть" },
    { key: "delete", label: "Удалить" },
  ];
}

function notificationStatus(item: CommunicationNotification) {
  const stats = item.delivery_stats || { recipients: 0, delivered: 0, read: 0, errors: 0 };
  if (item.status === "draft") return "draft";
  if (item.status === "scheduled") return "scheduled";
  if (item.status === "hidden") return "hidden";
  if (item.status === "deleted") return "deleted";
  if (item.status === "sending") return "sending";
  if (stats.recipients > 0 && stats.delivered === 0 && stats.errors >= stats.recipients * Math.max(enabledChannels(item).length, 1)) return "failed";
  if (stats.recipients > 0 && stats.read === stats.recipients) return "read";
  if (stats.read > 0) return "partially_read";
  if (stats.recipients > 0 && stats.delivered === stats.recipients) return "delivered";
  if (stats.delivered > 0) return "partially_delivered";
  if (item.sent_at || item.status === "sent") return "sent";
  return item.status;
}

function finalRecipientStatus(row: ReportRow) {
  const statuses = Object.values(row.channels).map((item) => item.status);
  if (statuses.includes("read")) return "read";
  if (statuses.includes("delivered")) return "delivered";
  if (statuses.includes("sent") || statuses.includes("queued") || statuses.includes("created")) return "sent";
  if (statuses.length > 0 && statuses.every((item) => item === "failed" || item === "channel_not_connected")) return "failed";
  return "queued";
}

function channelStatusLabel(value?: string) {
  if (!value) return "Не выбран";
  const labels: Record<string, string> = {
    created: "В очереди",
    queued: "В очереди",
    sending: "Отправляется",
    sent: "Отправлено",
    delivered: "Доставлено",
    read: "Прочитано",
    failed: "Ошибка",
    channel_not_connected: "Недоступно",
    not_delivered: "Не доставлено",
  };
  return labels[value] || value;
}

function statusText(value: string) {
  const labels: Record<string, string> = {
    draft: "Черновик",
    scheduled: "Запланировано",
    sending: "Отправляется",
    sent: "Отправлено",
    partially_delivered: "Частично доставлено",
    delivered: "Доставлено",
    partially_read: "Частично прочитано",
    read: "Прочитано",
    failed: "Ошибка отправки",
    hidden: "Скрыто",
    completed: "Завершено",
    deleted: "Удалено",
    queued: "В очереди",
  };
  return labels[value] || value;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function OwnerNotifications({ activeRole, refreshCommunicationUnreadCounts }: CabinetModuleProps) {
  const [items, setItems] = useState<CommunicationNotification[]>([]);
  const [selected, setSelected] = useState<CommunicationNotification | null>(null);
  const [filter, setFilter] = useState<OwnerFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchCommunicationNotificationsForRole(activeRole));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchCommunicationNotificationsForRole(activeRole)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRole]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "unread" && item.read_at) return false;
      if (filter === "important" && item.category !== "Аварийное") return false;
      if (!query) return true;
      return [item.title, item.category || "", stripHtml(item.body_html || item.body)]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, items, search]);
  const shownItems = visibleItems.slice(0, visibleCount);

  async function openNotification(item: CommunicationNotification) {
    let nextItem = item;
    setSelected(item);
    if (!item.read_at) {
      try {
        await markCommunicationNotificationRead(item.id);
        const readAt = new Date().toISOString();
        nextItem = {
          ...item,
          read_at: readAt,
          delivery_stats: {
            ...item.delivery_stats,
            read: Math.min(item.delivery_stats.recipients, item.delivery_stats.read + 1),
          },
        };
        setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? nextItem : currentItem)));
        setSelected(nextItem);
        await load();
        await refreshCommunicationUnreadCounts?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отметить уведомление прочитанным.");
      }
    }
  }

  return (
    <main className="gd-infocenter-page min-h-full">
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="gd-page-title">Уведомления</h1>
            <p className="gd-page-description mt-2 text-sm">Полученные уведомления, адресованные вам.</p>
          </div>
          <button onClick={() => void load()} className="gd-button">
            Обновить
          </button>
        </div>

        <OwnerViewerToolbar
          filter={filter}
          search={search}
          placeholder="Поиск по уведомлениям"
          onFilter={(value) => {
            setFilter(value);
            setVisibleCount(6);
          }}
          onSearch={(value) => {
            setSearch(value);
            setVisibleCount(6);
          }}
        />

        {error && <ErrorText text={error} />}
        {loading && <p className="gd-muted-panel mb-4 px-4 py-3 text-sm">Загрузка...</p>}

        <section className="space-y-3">
          {shownItems.map((item) => (
            <NotificationCard key={item.id} item={item} onOpen={() => void openNotification(item)} />
          ))}
          {visibleItems.length === 0 && !loading && <EmptyState text="Уведомлений пока нет." />}
        </section>
        {visibleCount < visibleItems.length && (
          <div className="mt-5 flex justify-center">
            <button
              onClick={() => setVisibleCount((value) => value + 6)}
              className="gd-button"
            >
              Показать ещё
            </button>
          </div>
        )}
      </div>
      {selected && <OwnerNotificationDetails item={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function OwnerViewerToolbar({
  filter,
  search,
  placeholder,
  onFilter,
  onSearch,
}: {
  filter: OwnerFilter;
  search: string;
  placeholder: string;
  onFilter: (value: OwnerFilter) => void;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="mb-5 space-y-3">
      <div className="gd-tabs">
        {ownerFilters.map((item) => (
          <button
            key={item.value}
            onClick={() => onFilter(item.value)}
            className={`gd-tab ${filter === item.value ? "gd-tab-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        className="gd-input"
        placeholder={placeholder}
      />
    </div>
  );
}

function PostForm({
  type,
  form,
  owners,
  saving,
  editing,
  error,
  setForm,
  onPublish,
  onDraft,
  onCancel,
}: {
  type: PostKind;
  form: Partial<CommunicationPost>;
  owners: CabinetModuleProps["owners"];
  saving: boolean;
  editing: boolean;
  error: string;
  setForm: (form: Partial<CommunicationPost>) => void;
  onPublish: () => void;
  onDraft: () => void;
  onCancel: () => void;
}) {
  return (
    <aside className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{editing ? "Редактирование" : "Новый материал"}</h2>
      <Field label="Заголовок">
        <input
          value={form.title || ""}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Изображение">
        <input
          value={form.image_url || ""}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="https://..."
        />
      </Field>
      <Field label="Текст">
        <RichTextEditor
          value={form.body || ""}
          onChange={(body) => setForm({ ...form, body })}
        />
      </Field>
      {type === "announcement" && (
        <>
          <Field label="Важность">
            <select
              value={form.importance || "normal"}
              onChange={(e) => setForm({ ...form, importance: e.target.value as CommunicationPost["importance"] })}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="normal">Обычное</option>
              <option value="important">Важное</option>
              <option value="urgent">Срочное</option>
            </select>
          </Field>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.is_pinned)}
              onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
            />
            Закрепить сверху
          </label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Начало показа">
              <input
                type="datetime-local"
                value={toLocalInput(form.visible_from)}
                onChange={(e) => setForm({ ...form, visible_from: fromLocalInput(e.target.value) })}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Окончание показа">
              <input
                type="datetime-local"
                value={toLocalInput(form.visible_until)}
                onChange={(e) => setForm({ ...form, visible_until: fromLocalInput(e.target.value) })}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </>
      )}
      <TargetPicker targets={form.targets || []} owners={owners} onChange={(targets) => setForm({ ...form, targets })} />
      <ChannelPicker
        channels={form.channels || []}
        allowed={["portal", "whatsapp", "telegram"]}
        onChange={(channels) => setForm({ ...form, channels })}
      />
      {error && <ErrorText text={error} />}
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={saving} onClick={onPublish} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Опубликовать
        </button>
        <button disabled={saving} onClick={onDraft} className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700">
          В черновик
        </button>
        {editing && (
          <button onClick={onCancel} className="rounded-xl border px-4 py-2 text-sm text-slate-600">
            Отмена
          </button>
        )}
      </div>
    </aside>
  );
}

function NotificationForm({
  form,
  owners,
  error,
  saving,
  setForm,
  onSubmit,
}: {
  form: Partial<CommunicationNotification>;
  owners: CabinetModuleProps["owners"];
  error: string;
  saving: boolean;
  setForm: (form: Partial<CommunicationNotification>) => void;
  onSubmit: () => void;
}) {
  return (
    <aside className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Создать уведомление</h2>
      <Field label="Заголовок">
        <input
          value={form.title || ""}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Сообщение">
        <textarea
          value={form.body || ""}
          maxLength={1000}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          className="min-h-32 w-full rounded-xl border px-3 py-2 text-sm"
        />
      </Field>
      <TargetPicker targets={form.targets || []} owners={owners} onChange={(targets) => setForm({ ...form, targets })} />
      <ChannelPicker
        channels={form.channels || []}
        allowed={["portal", "whatsapp", "sms"]}
        onChange={(channels) => setForm({ ...form, channels })}
      />
      {error && <ErrorText text={error} />}
      <button disabled={saving} onClick={onSubmit} className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
        Отправить
      </button>
    </aside>
  );
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  function command(name: string, commandValue?: string) {
    document.execCommand(name, false, commandValue);
    onChange(ref.current?.innerHTML || "");
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap gap-1 border-b bg-slate-50 p-2">
        <EditorButton label="B" onClick={() => command("bold")} />
        <EditorButton label="I" onClick={() => command("italic")} />
        <EditorButton label="H" onClick={() => command("formatBlock", "h2")} />
        <EditorButton label="•" onClick={() => command("insertUnorderedList")} />
        <EditorButton label="1." onClick={() => command("insertOrderedList")} />
        <EditorButton
          label="🔗"
          onClick={() => {
            const url = window.prompt("Ссылка");
            if (url) command("createLink", url);
          }}
        />
        <EditorButton
          label="🖼"
          onClick={() => {
            const url = window.prompt("URL изображения");
            if (url) command("insertImage", url);
          }}
        />
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={() => onChange(ref.current?.innerHTML || "")}
        className="prose min-h-40 max-w-none px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

function EditorButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-8 min-w-8 rounded-lg border bg-white px-2 text-sm font-semibold text-slate-700">
      {label}
    </button>
  );
}

function TargetPicker({
  targets,
  owners,
  onChange,
}: {
  targets: CommunicationTarget[];
  owners: CabinetModuleProps["owners"];
  onChange: (targets: CommunicationTarget[]) => void;
}) {
  const target = targets[0] || { type: "all", value: "" };
  return (
    <Field label="Аудитория">
      <div className="grid grid-cols-[150px_1fr] gap-2">
        <select
          value={target.type}
          onChange={(e) => onChange([{ type: e.target.value as CommunicationTarget["type"], value: "" }])}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="all">Все собственники</option>
          <option value="property_type">Тип имущества</option>
          <option value="role">Роль</option>
          <option value="user">Пользователь</option>
        </select>
        {target.type === "property_type" && (
          <select value={target.value} onChange={(e) => onChange([{ ...target, value: e.target.value }])} className="rounded-xl border px-3 py-2 text-sm">
            <option value="apartment">Владельцы квартир</option>
            <option value="commercial_room">Владельцы нежилых помещений</option>
            <option value="parking">Владельцы паркомест</option>
            <option value="storage">Владельцы кладовых</option>
          </select>
        )}
        {target.type === "role" && (
          <select value={target.value} onChange={(e) => onChange([{ ...target, value: e.target.value }])} className="rounded-xl border px-3 py-2 text-sm">
            <option value="OWNER">Собственники</option>
            <option value="COUNCIL_MEMBER">Члены совета дома</option>
            <option value="AUDITOR">Ревизор</option>
          </select>
        )}
        {target.type === "user" && (
          <select value={target.value} onChange={(e) => onChange([{ ...target, value: e.target.value }])} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">Выберите пользователя</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.full_name} · {owner.property_number}
              </option>
            ))}
          </select>
        )}
        {target.type === "all" && <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-500">Весь МЖК</div>}
      </div>
    </Field>
  );
}

function ChannelPicker({
  channels,
  allowed,
  onChange,
}: {
  channels: CommunicationChannel[];
  allowed: CommunicationChannel["channel"][];
  onChange: (channels: CommunicationChannel[]) => void;
}) {
  function checked(channel: CommunicationChannel["channel"]) {
    return channels.some((item) => item.channel === channel && item.enabled);
  }

  function toggle(channel: CommunicationChannel["channel"], enabled: boolean) {
    const next = channels.filter((item) => item.channel !== channel);
    next.push({ channel, enabled });
    onChange(next);
  }

  return (
    <Field label="Каналы">
      <div className="flex flex-wrap gap-3">
        {allowed.map((channel) => (
          <label key={channel} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <input type="checkbox" checked={checked(channel)} onChange={(e) => toggle(channel, e.target.checked)} />
            {channelLabel(channel)}
          </label>
        ))}
      </div>
    </Field>
  );
}

function PostCard({
  post,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onStatus,
}: {
  post: CommunicationPost;
  canManage?: boolean;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatus?: (status: CommunicationPost["status"]) => void;
}) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex gap-4">
        {post.image_url && <img src={post.image_url} alt="" className="h-24 w-32 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={post.status} />
            {post.is_pinned && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">Закреплено</span>}
            {post.importance !== "normal" && <span className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">{importanceLabel(post.importance)}</span>}
            {!post.read_at && !canManage && <span className="rounded-full bg-[var(--gd-accent)] px-2 py-1 text-xs text-white">Новое</span>}
          </div>
          <h2 className="text-xl font-semibold">{post.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{formatAstanaDateTime(post.publish_at || post.created_at)}</p>
          {post.visible_until && <p className="mt-1 text-sm text-slate-500">Актуально до {formatAstanaDateTime(post.visible_until)}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {onOpen && <button onClick={onOpen} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Открыть</button>}
        {canManage && (
          <>
            <button onClick={onEdit} className="rounded-xl border px-3 py-2 text-sm">Редактировать</button>
            <button onClick={() => onStatus?.(post.status === "hidden" ? "published" : "hidden")} className="rounded-xl border px-3 py-2 text-sm">
              {post.status === "hidden" ? "Показать" : "Скрыть"}
            </button>
            <button onClick={() => onStatus?.("published")} className="rounded-xl border px-3 py-2 text-sm">Опубликовать</button>
            <button onClick={onDelete} className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600">Удалить</button>
          </>
        )}
      </div>
    </article>
  );
}

function PostDetails({ post }: { post: CommunicationPost }) {
  return (
    <article className="rounded-2xl border bg-white p-6 shadow-sm">
      {post.image_url && <img src={post.image_url} alt="" className="mb-5 max-h-72 w-full rounded-xl object-cover" />}
      <p className="text-sm text-slate-500">{formatAstanaDateTime(post.publish_at || post.created_at)}</p>
      <h2 className="mt-2 text-2xl font-bold">{post.title}</h2>
      {post.visible_until && <p className="mt-2 text-sm text-slate-500">Актуально до {formatAstanaDateTime(post.visible_until)}</p>}
      <div className="prose mt-5 max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: post.body }} />
    </article>
  );
}

function NotificationCard({ item, onOpen }: { item: CommunicationNotification; onOpen?: () => void }) {
  const bodyText = stripHtml(item.body_html || item.body);
  return (
    <article
      onClick={onOpen}
      className={`gd-card transition hover:border-[var(--gd-primary)] ${
        onOpen ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-[var(--gd-muted)]">{formatAstanaDateTime(item.sent_at || item.created_at)}</span>
            {item.category && <span className="gd-status-pill gd-status-blue">{item.category}</span>}
            {item.category === "Аварийное" && <span className="gd-status-pill gd-status-red">Важное</span>}
            {item.read_at ? (
              <span className="gd-status-pill gd-status-slate">Прочитано</span>
            ) : (
              <span className="gd-status-pill gd-status-red">Новое</span>
            )}
          </div>
          <h2 className="truncate text-lg font-bold text-[var(--gd-text-strong)]">{item.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--gd-muted-strong)]">{bodyText}</p>
        </div>
        {onOpen && <span className="shrink-0 text-2xl text-[var(--gd-muted)]">›</span>}
      </div>
    </article>
  );
}

function OwnerNotificationDetails({ item, onClose }: { item: CommunicationNotification; onClose: () => void }) {
  return (
    <Modal title="Уведомление" onClose={onClose} wide>
      <article>
        <div className="flex flex-wrap gap-2">
          {item.category && <span className="gd-status-pill gd-status-blue">{item.category}</span>}
          {item.category === "Аварийное" && <span className="gd-status-pill gd-status-red">Важное</span>}
          <span className="gd-status-pill gd-status-slate">
            {item.read_at ? "Прочитано" : "Новое"}
          </span>
        </div>
        <p className="mt-4 text-sm text-[var(--gd-muted)]">{formatAstanaDateTime(item.sent_at || item.created_at)}</p>
        <h2 className="mt-2 text-3xl font-bold text-[var(--gd-text-strong)]">{item.title}</h2>
        <div className="infocenter-document-content mt-5" dangerouslySetInnerHTML={{ __html: item.body_html || item.body }} />
      </article>
      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="gd-button gd-button-primary">Закрыть</button>
      </div>
    </Modal>
  );
}

function FilterBar({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="gd-tabs mb-6">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`gd-tab ${value === item.value ? "gd-tab-active" : ""}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Header({ title, text }: { title: string; text: string }) {
  return (
    <div className="gd-page-header">
      <div>
        <h1 className="gd-page-title">{title}</h1>
        <p className="gd-page-description mt-2 text-sm">{text}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="gd-label">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="gd-empty-state text-sm">
      <span className="gd-icon-box mb-4">i</span>
      {text}
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return <p className="gd-alert gd-alert-danger mt-3">{text}</p>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: "Черновик",
    scheduled: "Запланировано",
    published: "Опубликовано",
    hidden: "Скрыто",
    deleted: "Удалено",
    sending: "Отправляется",
    sent: "Отправлено",
    partially_delivered: "Частично доставлено",
    delivered: "Доставлено",
    partially_read: "Частично прочитано",
    read: "Прочитано",
    completed: "Завершено",
    channel_not_connected: "Канал не подключён",
    failed: "Ошибка",
    created: "Создано",
    queued: "В очереди",
  };
  return <span className={`gd-status-pill ${statusBadgeToneClass(status)}`}>{labels[status] || status}</span>;
}

function statusBadgeToneClass(status: string) {
  if (status === "sent" || status === "delivered" || status === "read" || status === "published") {
    return "gd-status-emerald";
  }
  if (status === "scheduled" || status === "sending" || status === "queued" || status === "created") {
    return "gd-status-blue";
  }
  if (status === "failed" || status === "deleted" || status === "channel_not_connected") {
    return "gd-status-red";
  }
  if (status === "partially_delivered" || status === "partially_read") {
    return "gd-status-amber";
  }
  return "gd-status-slate";
}

function importanceLabel(value: CommunicationPost["importance"]) {
  if (value === "urgent") return "Срочное";
  if (value === "important") return "Важное";
  return "Обычное";
}

function channelLabel(value: string) {
  const labels: Record<string, string> = {
    portal: "Портал Bizdin Ui",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    sms: "SMS",
  };
  return labels[value] || value;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function getTodayDateTimeMinValue() {
  return `${getTodayDateValue()}T00:00`;
}

function getTodayDateValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}
