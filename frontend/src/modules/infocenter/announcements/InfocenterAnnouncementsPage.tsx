"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createInfocenterAnnouncement,
  fetchInfocenterAnnouncements,
  fetchMyInfocenterAnnouncements,
  markInfocenterAnnouncementRead,
  permanentDeleteInfocenterAnnouncement,
  runInfocenterAnnouncementAction,
  updateInfocenterAnnouncement,
} from "@/lib/infocenter-announcements";
import { formatAstanaDateTime } from "@/shared/lib/dateTime";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import type {
  InfocenterAnnouncement,
  InfocenterAnnouncementPayload,
  InfocenterAnnouncementStatus,
} from "@/types/infocenter-announcement";
import { InfocenterRichTextEditor } from "../shared/InfocenterRichTextEditor";

type TabValue = InfocenterAnnouncementStatus | "all";
type DrawerState = { mode: "create" | "edit"; item?: InfocenterAnnouncement } | null;
type ConfirmAction =
  | "publish"
  | "hide"
  | "show"
  | "complete"
  | "cancel-schedule"
  | "delete"
  | "restore"
  | "permanent";
type ConfirmState = { action: ConfirmAction; item: InfocenterAnnouncement } | null;

const tabs: { value: TabValue; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновики" },
  { value: "scheduled", label: "Запланированы" },
  { value: "published", label: "Опубликованы" },
  { value: "hidden", label: "Скрытые" },
  { value: "completed", label: "Завершенные" },
  { value: "deleted", label: "Удаленные" },
];

const categories = ["Коммунальные работы", "Собрание", "Уборка", "Ремонт", "Сервис"];
const audiences = [
  { value: "all_owners", label: "Все собственники" },
  { value: "apartments_commercial", label: "Квартиры и нежилые помещения" },
  { value: "storage_parking", label: "Кладовые и паркоместа" },
];

const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };
const inputClass = "gd-input";
const secondaryButton = "gd-button";
const primaryButton = "gd-button gd-button-primary";

function emptyForm(): InfocenterAnnouncementPayload {
  return {
    title: "",
    body_json: emptyDoc,
    body_html: "",
    category: categories[0],
    audience_type: audiences[0].value,
    audience_filter: null,
    is_pinned: false,
    is_important: false,
    notify_enabled: false,
    actual_until: null,
    scheduled_at: null,
  };
}

export function InfocenterAnnouncementsPage({ activeRole, refreshCommunicationUnreadCounts }: CabinetModuleProps) {
  const [items, setItems] = useState<InfocenterAnnouncement[]>([]);
  const [tab, setTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [details, setDetails] = useState<InfocenterAnnouncement | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const visibleItems = useMemo(() => {
    return [...items]
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => audienceFilter === "all" || item.audience_type === audienceFilter)
      .sort((first, second) => {
        const firstDate = dateTimeValue(first.published_at || first.scheduled_at || first.created_at);
        const secondDate = dateTimeValue(second.published_at || second.scheduled_at || second.created_at);
        return sortOrder === "newest" ? secondDate - firstDate : firstDate - secondDate;
      });
  }, [audienceFilter, categoryFilter, items, sortOrder]);

  const filtersActive = Boolean(search.trim() || categoryFilter !== "all" || audienceFilter !== "all" || sortOrder !== "newest");

  async function load() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      setItems(await fetchInfocenterAnnouncements({ status: tab, search }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить объявления.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchInfocenterAnnouncements({ status: tab, search })
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить объявления.");
      });
    return () => {
      cancelled = true;
    };
  }, [tab, search]);

  if (activeRole !== "CHAIRMAN") {
    return <AnnouncementsViewer refreshCommunicationUnreadCounts={refreshCommunicationUnreadCounts} />;
  }

  return (
    <main className="gd-infocenter-page min-h-full">
      <div className="w-full">
        <div className="gd-page-header">
          <div>
            <p className="gd-page-kicker text-sm font-semibold">Инфоцентр / Объявления</p>
            <h1 className="gd-page-title mt-1">Объявления</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="gd-button">
              Обновить
            </button>
            <button onClick={() => setDrawer({ mode: "create" })} 
                    className="gd-button gd-button-primary">
              + Создать объявление
            </button>
          </div>
        </div>

        <div className="gd-tabs mb-5">
          {tabs.map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={`gd-tab ${tab === item.value ? "gd-tab-active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
          className="gd-filter-panel"
        >
          <div className="gd-filter-grid">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="gd-input"
              placeholder="Поиск по заголовку или тексту..."
            />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="gd-input">
              <option value="all">Все категории</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)} className="gd-input">
              <option value="all">Все аудитории</option>
              {audiences.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
            </select>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")} className="gd-input">
              <option value="newest">Сначала новые</option>
              <option value="oldest">Сначала старые</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                  setAudienceFilter("all");
                  setSortOrder("newest");
                }}
                className="gd-button"
              >
                Сбросить
              </button>
            )}
          </div>
        </form>

        {error && <Message tone="error" text={error} />}
        {success && <Message tone="success" text={success} />}
        {loading && <Message text="Загрузка..." />}

        <section className="space-y-4">
          {visibleItems.map((item) => (
            <AnnouncementCard
              key={item.id}
              item={item}
              onOpen={() => setDetails(item)}
              onEdit={() => setDrawer({ mode: "edit", item })}
              onConfirm={(action) => setConfirm({ action, item })}
            />
          ))}
          {visibleItems.length === 0 && !loading && (
            <div className="gd-empty-state text-sm">
              Ничего не найдено.
            </div>
          )}
        </section>
      </div>

      {drawer && (
        <AnnouncementDrawer
          state={drawer}
          onClose={() => setDrawer(null)}
          onSaved={async (message) => {
            setDrawer(null);
            await load();
            setSuccess(message);
          }}
        />
      )}
      {details && (
        <DetailsModal
          item={details}
          onClose={() => setDetails(null)}
          onEdit={() => {
            setDrawer({ mode: "edit", item: details });
            setDetails(null);
          }}
          onConfirm={(action) => {
            setConfirm({ action, item: details });
            setDetails(null);
          }}
        />
      )}
      {confirm && (
        <ConfirmModal
          state={confirm}
          onClose={() => setConfirm(null)}
          onDone={async (message) => {
            setConfirm(null);
            await load();
            if (message) setSuccess(message);
          }}
        />
      )}
    </main>
  );
}

function AnnouncementsViewer({
  refreshCommunicationUnreadCounts,
}: {
  refreshCommunicationUnreadCounts?: () => Promise<void>;
}) {
  const [items, setItems] = useState<InfocenterAnnouncement[]>([]);
  const [details, setDetails] = useState<InfocenterAnnouncement | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "important">("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchMyInfocenterAnnouncements());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить объявления.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchMyInfocenterAnnouncements()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить объявления.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "unread" && item.read_at) return false;
      if (filter === "important" && !item.is_important && !item.is_pinned) return false;
      if (!query) return true;
      return [item.title, item.category, stripHtml(item.body_html)]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, items, search]);
  const shownItems = visibleItems.slice(0, visibleCount);

  async function openItem(item: InfocenterAnnouncement) {
    let nextItem = item;
    setDetails(item);
    if (!item.read_at) {
      try {
        await markInfocenterAnnouncementRead(item.id);
        const readAt = new Date().toISOString();
        nextItem = { ...item, read_at: readAt, reads_count: item.reads_count + 1, views_count: item.views_count + 1 };
        setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? nextItem : currentItem)));
        setDetails(nextItem);
        await refreshCommunicationUnreadCounts?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отметить объявление прочитанным.");
      }
    }
  }

  return (
    <main className="gd-infocenter-page min-h-full">
      <div className="w-full">
        <div className="gd-page-header">
          <div>
            <h1 className="gd-page-title">Объявления</h1>
            <p className="gd-page-description mt-2 text-sm">Опубликованные объявления, доступные вашей аудитории.</p>
          </div>
          <button onClick={() => void load()} className="gd-button">
            Обновить
          </button>
        </div>

        <ViewerToolbar
          filter={filter}
          search={search}
          placeholder="Поиск по объявлениям"
          onFilter={(value) => {
            setFilter(value);
            setVisibleCount(6);
          }}
          onSearch={(value) => {
            setSearch(value);
            setVisibleCount(6);
          }}
        />

        {error && <Message tone="error" text={error} />}
        {loading && <Message text="Загрузка..." />}

        <section className="space-y-3">
          {shownItems.map((item) => (
            <ViewerAnnouncementCard key={item.id} item={item} onOpen={() => void openItem(item)} />
          ))}
          {visibleItems.length === 0 && !loading && (
            <div className="gd-empty-state text-sm">
              Доступных объявлений пока нет.
            </div>
          )}
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
      {details && <ViewerAnnouncementDetails item={details} onClose={() => setDetails(null)} />}
    </main>
  );
}

function ViewerToolbar({
  filter,
  search,
  placeholder,
  onFilter,
  onSearch,
}: {
  filter: "all" | "unread" | "important";
  search: string;
  placeholder: string;
  onFilter: (value: "all" | "unread" | "important") => void;
  onSearch: (value: string) => void;
}) {
  const items: { value: "all" | "unread" | "important"; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "unread", label: "Непрочитанные" },
    { value: "important", label: "Важные" },
  ];
  return (
    <div className="gd-filter-panel">
      <div className="gd-tabs">
        {items.map((item) => (
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
        className="gd-input mt-3"
        placeholder={placeholder}
      />
    </div>
  );
}

function ViewerAnnouncementCard({ item, onOpen }: { item: InfocenterAnnouncement; onOpen: () => void }) {
  return (
    <article
      onClick={onOpen}
      className="gd-card cursor-pointer transition hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-slate-500">{item.published_at ? formatAstanaDateTime(item.published_at) : "Дата не указана"}</span>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{item.category}</span>
            {item.actual_until && <span className="text-slate-500">Актуально до {formatAstanaDateTime(item.actual_until)}</span>}
            {item.is_important && <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">Важное</span>}
            {item.is_pinned && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Закреплено</span>}
            {item.read_at ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Прочитано</span>
            ) : (
              <span className="rounded-full bg-red-600 px-2 py-1 text-white">Новое</span>
            )}
          </div>
          <h2 className="truncate text-lg font-bold text-slate-900">{item.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{stripHtml(item.body_html)}</p>
        </div>
        <span className="shrink-0 text-2xl text-slate-300">›</span>
      </div>
    </article>
  );
}

function ViewerAnnouncementDetails({ item, onClose }: { item: InfocenterAnnouncement; onClose: () => void }) {
  return (
    <Modal title="Объявление" onClose={onClose} wide>
      <article>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{item.category}</span>
          {item.is_important && <Pill tone="red">Важное объявление</Pill>}
          {item.is_pinned && <Pill tone="blue">Закреплено</Pill>}
        </div>
        <h2 className="mt-4 text-3xl font-bold">{item.title}</h2>
        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-2">
          <Meta label="Дата публикации" value={item.published_at ? formatAstanaDateTime(item.published_at) : "Не указано"} />
          <Meta label="Актуально до" value={item.actual_until ? formatAstanaDateTime(item.actual_until) : "Не указано"} />
          <Meta label="Категория" value={item.category} />
          <Meta label="Статус" value={item.read_at ? "прочитано" : "не прочитано"} />
        </div>
        <div className="infocenter-document-content mt-5" dangerouslySetInnerHTML={{ __html: item.body_html }} />
      </article>
      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Закрыть</button>
      </div>
    </Modal>
  );
}

function AnnouncementCard({
  item,
  onOpen,
  onEdit,
  onConfirm,
}: {
  item: InfocenterAnnouncement;
  onOpen: () => void;
  onEdit: () => void;
  onConfirm: (action: ConfirmAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article
      onClick={onOpen}
      className="gd-card cursor-pointer transition hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            {item.is_important && <Pill tone="red">Важное</Pill>}
            {item.is_pinned && <Pill tone="blue">Закреплено</Pill>}
          </div>
          <h2 className="text-xl font-bold text-slate-900">{item.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{stripHtml(item.body_html)}</p>
        </div>
        <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((value) => !value)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-lg leading-none text-slate-500 hover:bg-slate-50"
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-10 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-sm shadow-lg">
              {actionsFor(item).map((action) => (
                <button
                  key={action.key}
                  onClick={() => {
                    setMenuOpen(false);
                    if (action.key === "edit") onEdit();
                    else if (action.key === "details") onOpen();
                    else if (action.key === "publish-schedule") onConfirm("publish");
                    else onConfirm(action.key as ConfirmAction);
                  }}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-4">
        <Meta label="Категория" value={item.category} />
        <Meta label="Аудитория" value={audienceLabel(item.audience_type)} />
        <Meta label="Просмотры" value={`${item.views_count} просмотров`} />
        <Meta label="Прочитали" value={`${item.reads_count} прочитали`} />
      </div>
      <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <Meta label={dateTitle(item)} value={dateValue(item)} />
        <Meta label="Актуально до" value={item.actual_until ? formatAstanaDateTime(item.actual_until) : "Не указано"} />
      </div>
    </article>
  );
}

function AnnouncementDrawer({
  state,
  onClose,
  onSaved,
}: {
  state: DrawerState;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const item = state?.item;
  const [form, setForm] = useState<InfocenterAnnouncementPayload>(() =>
    item
      ? {
          title: item.title,
          body_json: item.body_json,
          body_html: item.body_html,
          category: item.category,
          audience_type: item.audience_type,
          audience_filter: item.audience_filter || null,
          is_pinned: item.is_pinned,
          is_important: item.is_important,
          notify_enabled: item.notify_enabled,
          actual_until: item.actual_until || null,
          scheduled_at: item.scheduled_at || null,
        }
      : emptyForm(),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actualUntilDate, setActualUntilDate] = useState(() => datePart(item?.actual_until));
  const [actualUntilTime, setActualUntilTime] = useState(() => timePart(item?.actual_until));
  const validation = validateForm(form, actualUntilDate, actualUntilTime);

  function updateActualUntil(nextDate: string, nextTime: string) {
    setActualUntilDate(nextDate);
    setActualUntilTime(nextTime);
    setForm((current) => ({
      ...current,
      actual_until: mergeDateTime(nextDate, nextTime),
    }));
  }

  async function save(mode: "draft" | "publish" | "schedule") {
    setSaving(true);
    setError("");
    try {
      let saved = item
        ? await updateInfocenterAnnouncement(item.id, form)
        : await createInfocenterAnnouncement(form, mode);
      if (item && mode === "publish") saved = await runInfocenterAnnouncementAction(saved.id, "publish");
      if (item && mode === "schedule") {
        saved = await runInfocenterAnnouncementAction(saved.id, "schedule", { scheduled_at: form.scheduled_at });
      }
      void saved;
      await onSaved(announcementSaveMessage(mode, form.notify_enabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить объявление");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <aside className="h-full w-full max-w-4xl overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5">
          <div>
            <p className="text-sm font-medium text-blue-600">Инфоцентр / Объявления</p>
            <h2 className="text-2xl font-bold text-slate-900">
              {item ? "Редактировать объявление" : "Создать объявление"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="h-[calc(100%-156px)] overflow-y-auto bg-slate-50 px-7 py-6">
          {error && <Message tone="error" text={error} />}
          <div className="space-y-5">
            <FormBlock title="Основные данные" description="Заполните заголовок, категорию, аудиторию и срок актуальности.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Заголовок" required>
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Категория">
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Аудитория">
                  <select value={form.audience_type} onChange={(event) => setForm({ ...form, audience_type: event.target.value })} className={inputClass}>
                    {audiences.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
                  </select>
                </Field>
                <Field label="Актуально до" required>
                  <input
                    type="date"
                    value={actualUntilDate}
                    onChange={(event) => updateActualUntil(event.target.value, actualUntilTime)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Время" required>
                  <input
                    type="time"
                    value={actualUntilTime}
                    onChange={(event) => updateActualUntil(actualUntilDate, event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </FormBlock>

            <FormBlock title="Содержание" description="Текст сохраняется с форматированием для предпросмотра и публикации.">
              <Field label="Текст объявления" required>
                <InfocenterRichTextEditor
                  value={form.body_html}
                  onChange={(html) => setForm({ ...form, body_html: html, body_json: htmlDocumentJSON(html) })}
                />
              </Field>
            </FormBlock>

            <FormBlock title="Дополнительные параметры" description="Настройте важность объявления, закрепление и отправку уведомления.">
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <CheckBox checked={form.is_important} onChange={(value) => setForm({ ...form, is_important: value })}>Важное объявление</CheckBox>
                <CheckBox checked={form.is_pinned} onChange={(value) => setForm({ ...form, is_pinned: value })}>Закрепить наверху</CheckBox>
                <CheckBox checked={form.notify_enabled} onChange={(value) => setForm({ ...form, notify_enabled: value })}>Отправить уведомление</CheckBox>
              </div>
            </FormBlock>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-7 py-4">
          <div className="mr-auto text-sm font-medium text-slate-500">{validation.valid ? "Готово к предпросмотру" : validation.messages[0]}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onClose} className={secondaryButton}>Отмена</button>
            <button disabled={saving || !validation.valid} onClick={() => void save("draft")} className={secondaryButton}>Сохранить как черновик</button>
            <button disabled={saving || !validation.valid} onClick={() => setPreviewOpen(true)} className="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-45">
              Предпросмотр
            </button>
          </div>
        </div>
      </aside>
      {previewOpen && (
        <PreviewModal
          form={form}
          validation={validation}
          onClose={() => setPreviewOpen(false)}
          onDraft={() => void save("draft")}
          onPublish={() => void save(form.scheduled_at ? "schedule" : "publish")}
        />
      )}
    </div>
  );
}

function PreviewModal({
  form,
  validation,
  onClose,
  onDraft,
  onPublish,
}: {
  form: InfocenterAnnouncementPayload;
  validation: { valid: boolean; messages: string[] };
  onClose: () => void;
  onDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <Modal title="Предпросмотр объявления" onClose={onClose} wide>
      <p className="mb-4 font-semibold">Как увидит собственник:</p>
      <article className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          {form.is_important && <Pill tone="red">Важное объявление</Pill>}
          {form.is_pinned && <Pill tone="blue">Закреплено</Pill>}
        </div>
        <h2 className="text-3xl font-bold">{form.title}</h2>
        <div className="infocenter-document-content mt-5" dangerouslySetInnerHTML={{ __html: form.body_html }} />
        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-2">
          <Meta label="Категория" value={form.category} />
          <Meta label="Аудитория" value={audienceLabel(form.audience_type)} />
          <Meta label="Актуально до" value={form.actual_until ? formatAstanaDateTime(form.actual_until) : "Не указано"} />
          <Meta label="Уведомление" value={form.notify_enabled ? "будет отправлено" : "не будет отправлено"} />
        </div>
      </article>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className={secondaryButton}>Назад к редактированию</button>
        <button disabled={!validation.valid} onClick={onDraft} className={secondaryButton}>Сохранить как черновик</button>
        <button disabled={!validation.valid} onClick={onPublish} className="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-45">
          {form.scheduled_at ? "Запланировать" : "Опубликовать"}
        </button>
      </div>
    </Modal>
  );
}

function DetailsModal({
  item,
  onClose,
  onEdit,
  onConfirm,
}: {
  item: InfocenterAnnouncement;
  onClose: () => void;
  onEdit: () => void;
  onConfirm: (action: ConfirmAction) => void;
}) {
  return (
    <Modal title="Подробнее" onClose={onClose} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <article>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={item.status} />
            {item.is_important && <Pill tone="red">Важное</Pill>}
            {item.is_pinned && <Pill tone="blue">Закреплено</Pill>}
          </div>
          <h2 className="mt-4 text-3xl font-bold">{item.title}</h2>
          <div className="infocenter-document-content mt-5" dangerouslySetInnerHTML={{ __html: item.body_html }} />
        </article>
        <aside className="space-y-4 text-sm">
          <div className="rounded-2xl bg-slate-50 p-4">
            <Meta label="Категория" value={item.category} />
            <Meta label="Аудитория" value={audienceLabel(item.audience_type)} />
            <Meta label="Автор" value={item.author_name} />
            <Meta label="Дата публикации" value={item.published_at ? formatAstanaDateTime(item.published_at) : "Не опубликовано"} />
            <Meta label="Актуально до" value={item.actual_until ? formatAstanaDateTime(item.actual_until) : "Не указано"} />
            <Meta label="Просмотры" value={String(item.views_count)} />
            <Meta label="Прочитали" value={String(item.reads_count)} />
            <Meta label="Уведомление" value={item.notify_enabled ? "отправлено / включено" : "не отправлено"} />
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="font-semibold">История действий</p>
            <div className="mt-3 space-y-3">
              {item.history.map((history) => (
                <div key={history.id}>
                  <p className="font-medium">{actionLabel(history.action)}</p>
                  <p className="text-xs text-slate-500">{formatAstanaDateTime(history.created_at)} · {history.actor_id}</p>
                  {history.reason && <p className="text-xs text-slate-600">Причина: {history.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {item.status !== "deleted" && <button onClick={onEdit} className={secondaryButton}>Редактировать</button>}
        {item.status === "published" && <button onClick={() => onConfirm("hide")} className={secondaryButton}>Скрыть</button>}
        {item.status === "hidden" && <button onClick={() => onConfirm("show")} className={secondaryButton}>Показать</button>}
        {(item.status === "published" || item.status === "hidden") && <button onClick={() => onConfirm("complete")} className={secondaryButton}>Завершить</button>}
        <button onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Закрыть</button>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  state,
  onClose,
  onDone,
}: {
  state: NonNullable<ConfirmState>;
  onClose: () => void;
  onDone: (message?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState("");
  const meta = confirmMeta(state.action);
  const publicationMinDateTime = getTodayDateTimeMinValue();
  const disabled =
    (state.action === "complete" && !reason.trim()) ||
    (state.action === "permanent" && confirmText !== "УДАЛИТЬ") ||
    (state.action === "publish" && publishMode === "schedule" && !scheduledAt);

  async function submit() {
    setError("");
    try {
      if (state.action === "permanent") {
        await permanentDeleteInfocenterAnnouncement(state.item.id);
      } else if (state.action === "publish" && publishMode === "schedule") {
        await runInfocenterAnnouncementAction(state.item.id, "schedule", { scheduled_at: new Date(scheduledAt).toISOString() });
      } else if (state.action === "publish") {
        await runInfocenterAnnouncementAction(state.item.id, "publish");
      } else {
        await runInfocenterAnnouncementAction(state.item.id, state.action, { reason });
      }
      await onDone(announcementActionMessage(state.action, state.item.notify_enabled, publishMode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    }
  }

  return (
    <Modal title={meta.title} onClose={onClose}>
      <p className="text-slate-600">{meta.text}</p>
      {state.action === "publish" && (
        <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <Meta label="Заголовок" value={state.item.title} />
          <Meta label="Аудитория" value={audienceLabel(state.item.audience_type)} />
          <Meta label="Актуально до" value={state.item.actual_until ? formatAstanaDateTime(state.item.actual_until) : "Не указано"} />
          <Meta label="Уведомление" value={state.item.notify_enabled ? "будет отправлено" : "не будет отправлено"} />
          <p className="font-semibold">Когда опубликовать?</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={publishMode === "now"} onChange={() => setPublishMode("now")} />
            Сейчас
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={publishMode === "schedule"} onChange={() => setPublishMode("schedule")} />
            Запланировать
          </label>
          {publishMode === "schedule" && <input type="datetime-local" min={publicationMinDateTime} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />}
        </div>
      )}
      {state.action === "hide" && (
        <Field label="Причина, необязательно">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} min-h-24`} />
        </Field>
      )}
      {state.action === "complete" && (
        <Field label="Причина завершения" required>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} min-h-24`} />
        </Field>
      )}
      {state.action === "permanent" && (
        <Field label="Для подтверждения введите: УДАЛИТЬ">
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputClass} />
        </Field>
      )}
      {error && <Message tone="error" text={error} />}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className={secondaryButton}>Отмена</button>
        <button disabled={disabled} onClick={() => void submit()} className={primaryButton}>{meta.button}</button>
      </div>
    </Modal>
  );
}

function actionsFor(item: InfocenterAnnouncement) {
  if (item.status === "draft") return [
    { key: "edit", label: "Редактировать" },
    { key: "details", label: "Предпросмотр" },
    { key: "publish", label: "Опубликовать" },
    { key: "publish-schedule", label: "Запланировать" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "scheduled") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "publish", label: "Опубликовать сейчас" },
    { key: "cancel-schedule", label: "Отменить расписание" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "published") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "hide", label: "Скрыть" },
    { key: "complete", label: "Завершить" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "hidden") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "show", label: "Показать" },
    { key: "complete", label: "Завершить" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "completed") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "publish", label: "Опубликовать повторно" },
    { key: "delete", label: "Удалить" },
  ];
  return [
    { key: "details", label: "Подробнее" },
    { key: "restore", label: "Восстановить" },
    { key: "permanent", label: "Удалить навсегда" },
  ];
}

function confirmMeta(action: ConfirmAction) {
  const map: Record<ConfirmAction, { title: string; text: string; button: string }> = {
    publish: { title: "Опубликовать объявление?", text: "Объявление станет доступно выбранной аудитории.", button: "Опубликовать" },
    hide: { title: "Скрыть объявление?", text: "Объявление временно перестанет отображаться у собственников.", button: "Скрыть" },
    show: { title: "Показать объявление?", text: "Объявление снова станет доступно собственникам.", button: "Показать" },
    complete: { title: "Завершить объявление?", text: "Объявление будет убрано из активных объявлений, потому что оно больше не актуально.", button: "Завершить" },
    "cancel-schedule": { title: "Отменить запланированную публикацию?", text: "Объявление вернется в черновики.", button: "Отменить расписание" },
    delete: { title: "Удалить объявление?", text: "Объявление будет перемещено в раздел «Удаленные». Его можно будет восстановить.", button: "Удалить" },
    restore: { title: "Восстановить объявление?", text: "Объявление будет восстановлено как черновик, чтобы случайно не появиться у собственников.", button: "Восстановить как черновик" },
    permanent: { title: "Удалить объявление навсегда?", text: "Это действие нельзя отменить.", button: "Удалить навсегда" },
  };
  return map[action];
}

function validateForm(form: InfocenterAnnouncementPayload, actualUntilDate: string, actualUntilTime: string) {
  const bodyText = stripHtml(form.body_html);
  const valid = Boolean(form.title.trim() && bodyText && actualUntilDate && actualUntilTime && form.actual_until);
  return {
    valid,
    messages: [
      form.title.trim() ? "заголовок заполнен" : "заголовок не заполнен",
      bodyText ? "текст объявления заполнен" : "текст объявления не заполнен",
      actualUntilDate && actualUntilTime ? "срок актуальности заполнен" : "актуально до и время не заполнены",
    ],
  };
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="gd-modal-overlay z-[70] grid place-items-center">
      <section className={`gd-modal-panel ${wide ? "w-full max-w-5xl" : "w-full max-w-lg"}`}>
        <div className="gd-modal-header">
          <h2 className="text-2xl font-bold text-[color:var(--gd-text-strong)]">{title}</h2>
          <button onClick={onClose} className="gd-button px-3 py-2">✕</button>
        </div>
        <div className="gd-modal-body max-h-[68vh] overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

function FormBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="gd-card">
      <h3 className="text-lg font-bold text-[color:var(--gd-text-strong)]">{title}</h3>
      {description && <p className="mt-1 text-sm text-[color:var(--gd-muted)]">{description}</p>}
      {children}
    </section>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="mt-4 block">
      <span className="gd-label">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </div>
  );
}

function CheckBox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="gd-muted-panel flex items-center gap-3 px-4 py-3 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100"
      />
      {children}
    </label>
  );
}

function Pill({ tone, children }: { tone: "red" | "blue"; children: ReactNode }) {
  const className = tone === "red" ? "gd-status-red" : "gd-status-blue";
  return <span className={`gd-status-pill ${className}`}>{children}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="block">
      <b className="text-slate-900">{label}:</b> {value}
    </span>
  );
}

function Message({ text, tone = "info" }: { text: string; tone?: "info" | "error" | "success" }) {
  const className = tone === "error" ? "gd-alert-danger" : tone === "success" ? "gd-alert-success" : "gd-status-slate";
  return <p className={`gd-alert mb-4 ${className}`}>{text}</p>;
}

function StatusBadge({ status }: { status: InfocenterAnnouncementStatus }) {
  return <span className={`gd-status-pill ${announcementStatusTone(status)}`}>{statusLabel(status)}</span>;
}

function announcementStatusTone(status: InfocenterAnnouncementStatus) {
  const classes: Record<InfocenterAnnouncementStatus, string> = {
    draft: "gd-status-slate",
    scheduled: "gd-status-amber",
    published: "gd-status-emerald",
    hidden: "gd-status-violet",
    completed: "gd-status-blue",
    deleted: "gd-status-red",
  };
  return classes[status];
}

function statusLabel(status: InfocenterAnnouncementStatus) {
  const labels: Record<InfocenterAnnouncementStatus, string> = {
    draft: "Черновик",
    scheduled: "Запланировано",
    published: "Опубликовано",
    hidden: "Скрыто",
    completed: "Завершено",
    deleted: "Удалено",
  };
  return labels[status];
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    created: "Создано",
    updated: "Обновлено",
    published: "Опубликовано",
    scheduled: "Запланировано",
    schedule_cancelled: "Расписание отменено",
    hidden: "Скрыто",
    shown: "Показано",
    completed: "Завершено",
    deleted: "Удалено",
    restored: "Восстановлено",
    permanently_deleted: "Удалено навсегда",
  };
  return labels[action] || action;
}

function audienceLabel(value: string) {
  return audiences.find((item) => item.value === value)?.label || value;
}

function dateTitle(item: InfocenterAnnouncement) {
  if (item.status === "scheduled") return "Запланировано";
  if (item.published_at) return "Опубликовано";
  return "Создано";
}

function dateValue(item: InfocenterAnnouncement) {
  if (item.status === "scheduled" && item.scheduled_at) return formatAstanaDateTime(item.scheduled_at);
  if (item.published_at) return formatAstanaDateTime(item.published_at);
  return formatAstanaDateTime(item.created_at);
}

function dateTimeValue(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function announcementSaveMessage(mode: "draft" | "publish" | "schedule", notifyEnabled: boolean) {
  if (mode === "draft") return "Объявление сохранено как черновик.";
  if (mode === "schedule") return "Объявление запланировано.";
  return notifyEnabled ? "Объявление опубликовано, уведомление отправлено." : "Объявление опубликовано.";
}

function announcementActionMessage(action: ConfirmAction, notifyEnabled: boolean, publishMode: "now" | "schedule") {
  if (action === "publish" && publishMode === "schedule") return "Объявление запланировано.";
  if (action === "publish") return notifyEnabled ? "Объявление опубликовано, уведомление отправлено." : "Объявление опубликовано.";
  if (action === "cancel-schedule") return "Расписание публикации отменено.";
  if (action === "hide") return "Объявление скрыто.";
  if (action === "show") return "Объявление опубликовано.";
  if (action === "complete") return "Объявление завершено.";
  if (action === "restore") return "Объявление восстановлено как черновик.";
  if (action === "delete") return "Объявление перемещено в удаленные.";
  return "Действие выполнено.";
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function htmlDocumentJSON(html: string) {
  return { type: "tinymce-html", html };
}

function datePart(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function timePart(value?: string | null) {
  return value ? value.slice(11, 16) : "";
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

function mergeDateTime(date: string, time: string) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}`).toISOString();
}
