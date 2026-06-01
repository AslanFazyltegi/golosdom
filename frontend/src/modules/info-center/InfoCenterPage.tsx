"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  deleteCommunicationPost,
  fetchCommunicationDeliveries,
  fetchCommunicationNotificationsForRole,
  fetchCommunicationPosts,
  markCommunicationNotificationRead,
  markCommunicationPostRead,
  saveCommunicationPost,
  sendCommunicationNotification,
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
    return <DeliveryReports />;
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
    <>
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
    </>
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
    <>
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
    </>
  );
}

function ChairmanNotifications({ owners, activeRole }: CabinetModuleProps) {
  const [items, setItems] = useState<CommunicationNotification[]>([]);
  const [form, setForm] = useState<Partial<CommunicationNotification>>(emptyNotificationForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setItems(await fetchCommunicationNotificationsForRole(activeRole));
  }

  useEffect(() => {
    fetchCommunicationNotificationsForRole(activeRole)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, [activeRole]);

  async function submit() {
    setError("");
    setSaving(true);
    try {
      await sendCommunicationNotification(form);
      setForm(emptyNotificationForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="Уведомления" text="Короткие сообщения выбранным получателям." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          {items.map((item) => (
            <NotificationCard key={item.id} item={item} />
          ))}
          {items.length === 0 && <EmptyState text="Уведомлений пока нет." />}
        </section>
        <NotificationForm
          form={form}
          owners={owners}
          error={error}
          saving={saving}
          setForm={setForm}
          onSubmit={submit}
        />
      </div>
    </>
  );
}

function OwnerNotifications({ activeRole, refreshCommunicationUnreadCounts }: CabinetModuleProps) {
  const [items, setItems] = useState<CommunicationNotification[]>([]);
  const [selected, setSelected] = useState<CommunicationNotification | null>(null);
  const [filter, setFilter] = useState<OwnerFilter>("all");
  const [error, setError] = useState("");

  async function load() {
    setItems(await fetchCommunicationNotificationsForRole(activeRole));
  }

  useEffect(() => {
    fetchCommunicationNotificationsForRole(activeRole)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, [activeRole]);

  const visibleItems = items.filter((item) => (filter === "unread" ? !item.read_at : true));

  async function openNotification(item: CommunicationNotification) {
    setSelected(item);
    if (!item.read_at) {
      await markCommunicationNotificationRead(item.id);
      await load();
      await refreshCommunicationUnreadCounts?.();
    }
  }

  return (
    <>
      <Header title="Уведомления" text="Полученные сообщения по вашему МЖК." />
      <FilterBar
        items={ownerFilters}
        value={filter}
        onChange={(value) => setFilter(value as OwnerFilter)}
      />
      {error && <ErrorText text={error} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          {visibleItems.map((item) => (
            <NotificationCard key={item.id} item={item} onOpen={() => openNotification(item)} />
          ))}
          {visibleItems.length === 0 && <EmptyState text="Уведомлений пока нет." />}
        </section>
        {selected ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">{formatAstanaDateTime(selected.sent_at || selected.created_at)}</p>
            <h2 className="mt-2 text-2xl font-bold">{selected.title}</h2>
            <p className="mt-4 whitespace-pre-wrap text-slate-700">{selected.body}</p>
          </section>
        ) : (
          <EmptyState text="Откройте уведомление из списка." />
        )}
      </div>
    </>
  );
}

function DeliveryReports() {
  const [items, setItems] = useState<CommunicationDelivery[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCommunicationDeliveries()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, []);

  return (
    <>
      <Header title="Отчёты доставки" text="Статусы отправки по каждому получателю и каналу." />
      {error && <ErrorText text={error} />}
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr_0.9fr_1fr] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500">
          <span>Материал</span>
          <span>Тип</span>
          <span>Канал</span>
          <span>Получатель</span>
          <span>Статус</span>
          <span>Даты</span>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr_0.9fr_1fr] gap-3 border-b px-5 py-4 text-sm last:border-b-0"
          >
            <span className="font-medium">{item.entity_title || item.entity_id}</span>
            <span>{item.entity_type === "post" ? "Новость/объявление" : "Уведомление"}</span>
            <span>{channelLabel(item.channel)}</span>
            <span>{item.recipient}</span>
            <span>
              <StatusBadge status={item.status} />
              {item.error_message && <p className="mt-1 text-xs text-red-600">{item.error_message}</p>}
            </span>
            <span className="text-xs text-slate-500">
              {formatAstanaDateTime(item.sent_at || item.created_at)}
              {item.read_at && <><br />Прочитано: {formatAstanaDateTime(item.read_at)}</>}
            </span>
          </div>
        ))}
        {items.length === 0 && <div className="p-6"><EmptyState text="Отчётов пока нет." /></div>}
      </section>
    </>
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
            {!post.read_at && !canManage && <span className="rounded-full bg-red-600 px-2 py-1 text-xs text-white">Новое</span>}
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
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{formatAstanaDateTime(item.sent_at || item.created_at)}</p>
          <p className="mt-3 line-clamp-2 text-sm text-slate-700">{item.body}</p>
        </div>
        {!item.read_at && onOpen && <span className="rounded-full bg-red-600 px-2 py-1 text-xs text-white">Новое</span>}
      </div>
      {onOpen && <button onClick={onOpen} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Открыть</button>}
    </article>
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
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${value === item.value ? "bg-blue-600 text-white" : "border bg-white text-slate-600"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Header({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-500">{text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 block text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border bg-white p-6 text-sm text-slate-500 shadow-sm">{text}</div>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: "Черновик",
    scheduled: "Запланировано",
    published: "Опубликовано",
    hidden: "Скрыто",
    deleted: "Удалено",
    sent: "Отправлено",
    delivered: "Доставлено",
    read: "Прочитано",
    channel_not_connected: "Канал не подключён",
    failed: "Ошибка",
    created: "Создано",
    queued: "В очереди",
  };
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{labels[status] || status}</span>;
}

function importanceLabel(value: CommunicationPost["importance"]) {
  if (value === "urgent") return "Срочное";
  if (value === "important") return "Важное";
  return "Обычное";
}

function channelLabel(value: string) {
  const labels: Record<string, string> = {
    portal: "Портал Golosdom",
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

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}
