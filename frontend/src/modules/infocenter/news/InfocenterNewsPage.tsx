"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createInfocenterNews,
  deleteInfocenterNewsImage,
  fetchInfocenterNews,
  infocenterNewsMediaUrl,
  permanentDeleteInfocenterNews,
  runInfocenterNewsAction,
  setInfocenterNewsCover,
  updateInfocenterNews,
  uploadInfocenterNewsImage,
} from "@/lib/infocenter-news";
import { formatAstanaDateTime } from "@/shared/lib/dateTime";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import type {
  InfocenterNews,
  InfocenterNewsPayload,
  InfocenterNewsStatus,
} from "@/types/infocenter-news";
import { NewsDocumentEditor } from "./components/NewsDocumentEditor";

type TabValue = InfocenterNewsStatus | "all";
type DrawerState = { mode: "create" | "edit"; item?: InfocenterNews } | null;
type ConfirmState =
  | { action: "hide" | "show" | "unpublish" | "delete" | "restore" | "permanent"; item: InfocenterNews }
  | null;

const tabs: { value: TabValue; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновики" },
  { value: "scheduled", label: "Запланированы" },
  { value: "published", label: "Опубликованы" },
  { value: "hidden", label: "Скрытые" },
  { value: "unpublished", label: "Снятые с публикации" },
  { value: "deleted", label: "Удаленные" },
];

const categories = [
  "Объявления ОСИ",
  "Коммунальные работы",
  "Безопасность",
  "Финансы ОСИ",
  "Сервис",
];

const audiences = [
  { value: "all_owners", label: "Все собственники Galamat Park" },
  { value: "apartments_commercial", label: "Квартиры и нежилые помещения" },
  { value: "storage_parking", label: "Кладовые и паркоместа" },
  { value: "council_members", label: "Только члены совета дома" },
];

const emptyDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const drawerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";

const drawerPrimaryButtonClass =
  `${drawerButtonClass} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`;

const emptyForm = (): InfocenterNewsPayload => ({
  title: "",
  summary: "",
  body_json: emptyDoc,
  body_html: "",
  category: categories[0],
  audience_type: audiences[0].value,
  audience_filter: null,
  is_pinned: false,
  is_important: false,
  notify_enabled: false,
  scheduled_at: null,
});

export function InfocenterNewsPage({ activeRole }: CabinetModuleProps) {
  const [items, setItems] = useState<InfocenterNews[]>([]);
  const [tab, setTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [details, setDetails] = useState<InfocenterNews | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchInfocenterNews({ status: tab, search }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить новости. Проверьте подключение к серверу.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInfocenterNews({ status: tab, search })
      .then(setItems)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Не удалось загрузить новости. Проверьте подключение к серверу."),
      );
  }, [tab, search]);

  if (activeRole !== "CHAIRMAN") {
    return (
      <section className="min-h-screen bg-slate-100 p-6 text-slate-900">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Нет доступа</h1>
          <p className="mt-2 text-slate-500">Управление новостями доступно только председателю.</p>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-600">Инфоцентр</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">Новости</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Обновить
            </button>
            <button
              onClick={() => setDrawer({ mode: "create" })}
              className="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Создать новость
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold ${
                tab === item.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
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
          className="mb-6"
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            placeholder="Поиск по заголовку, описанию и категории..."
          />
        </form>

        {error && <Message tone="error" text={error} />}
        {loading && <Message text="Загрузка..." />}

        <section className="space-y-4">
          {items.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              onOpen={() => setDetails(item)}
              onEdit={() => setDrawer({ mode: "edit", item })}
              onConfirm={(action) => setConfirm({ action, item })}
              onAction={async (action) => {
                await runInfocenterNewsAction(item.id, action);
                await load();
              }}
            />
          ))}
          {items.length === 0 && !loading && (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              Новости не найдены.
            </div>
          )}
        </section>
      </div>

      {drawer && (
        <NewsDrawer
          state={drawer}
          onClose={() => setDrawer(null)}
          onSaved={async () => {
            setDrawer(null);
            await load();
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
          onDone={async () => {
            setConfirm(null);
            await load();
          }}
        />
      )}
    </main>
  );
}

function NewsCard({
  item,
  onOpen,
  onEdit,
  onConfirm,
  onAction,
}: {
  item: InfocenterNews;
  onOpen: () => void;
  onEdit: () => void;
  onConfirm: (action: NonNullable<ConfirmState>["action"]) => void;
  onAction: (action: "publish" | "cancel-schedule") => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cover = coverImage(item);

  return (
    <article
      onClick={onOpen}
      className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex gap-5">
        <div className="hidden h-24 w-32 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 sm:block">
          {cover ? (
            <img src={infocenterNewsMediaUrl(cover.file_url)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl text-slate-300">📰</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            {item.is_important && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Важная</span>}
            {item.is_pinned && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">Закреплена</span>}
          </div>
          <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.summary}</p>
        </div>
        <div className="relative flex shrink-0 flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
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
                    if (action.key === "details") onOpen();
                    if (action.key === "publish") void onAction("publish");
                    if (action.key === "cancel-schedule") void onAction("cancel-schedule");
                    if (["hide", "show", "unpublish", "delete", "restore", "permanent"].includes(action.key)) {
                      onConfirm(action.key as NonNullable<ConfirmState>["action"]);
                    }
                  }}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {item.status !== "deleted" && (
            <button onClick={onEdit} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Редактировать
            </button>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-4">
        <span><b className="text-slate-900">Категория:</b> {item.category}</span>
        <span><b className="text-slate-900">Аудитория:</b> {audienceLabel(item.audience_type)}</span>
        <span><b className="text-slate-900">Дата:</b> {dateLabel(item)}</span>
        <span><b className="text-slate-900">Статистика:</b> {item.views_count} / {item.reads_count}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
        {item.status === "draft" && <QuickButton onClick={() => void onAction("publish")}>Опубликовать</QuickButton>}
        {item.status === "scheduled" && <QuickButton onClick={() => void onAction("publish")}>Опубликовать сейчас</QuickButton>}
        {item.status === "scheduled" && <QuickButton onClick={() => void onAction("cancel-schedule")}>Отменить расписание</QuickButton>}
        {item.status === "published" && <QuickButton onClick={() => onConfirm("hide")}>Скрыть</QuickButton>}
        {item.status === "hidden" && <QuickButton onClick={() => onConfirm("show")}>Показать</QuickButton>}
        {(item.status === "published" || item.status === "hidden") && <QuickButton onClick={() => onConfirm("unpublish")}>Снять с публикации</QuickButton>}
        {item.status === "deleted" && <QuickButton onClick={() => onConfirm("restore")}>Восстановить</QuickButton>}
      </div>
    </article>
  );
}

function NewsDrawer({
  state,
  onClose,
  onSaved,
}: {
  state: DrawerState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const item = state?.item;
  const [form, setForm] = useState<InfocenterNewsPayload>(() =>
    item
      ? {
          title: item.title,
          summary: item.summary,
          body_json: item.body_json,
          body_html: item.body_html,
          category: item.category,
          audience_type: item.audience_type,
          audience_filter: item.audience_filter || null,
          is_pinned: item.is_pinned,
          is_important: item.is_important,
          notify_enabled: item.notify_enabled,
          scheduled_at: item.scheduled_at || null,
        }
      : emptyForm(),
  );
  const [current, setCurrent] = useState<InfocenterNews | undefined>(item);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingCoverIndex, setPendingCoverIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const validation = validateForm(form);

  async function save(mode: "draft" | "publish" | "schedule") {
    setSaving(true);
    setError("");
    try {
      let saved = current;
      if (saved) {
        saved = await updateInfocenterNews(saved.id, form);
        if (mode === "publish") saved = await runInfocenterNewsAction(saved.id, "publish");
        if (mode === "schedule") saved = await runInfocenterNewsAction(saved.id, "schedule", { scheduled_at: form.scheduled_at });
      } else {
        saved = await createInfocenterNews(form, mode);
      }
      saved = await uploadPendingFiles(saved, pendingFiles, pendingCoverIndex);
      setCurrent(saved);
      setPendingFiles([]);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить новость");
    } finally {
      setSaving(false);
    }
  }

  async function removeImage(imageID: string) {
    if (!current) return;
    setCurrent(await deleteInfocenterNewsImage(current.id, imageID));
  }

  async function chooseCover(imageID: string) {
    if (!current) return;
    setCurrent(await setInfocenterNewsCover(current.id, imageID));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <aside className="h-full w-full max-w-4xl overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5">
          <div>
            <p className="text-sm font-medium text-blue-600">Инфоцентр / Новости</p>
            <h2 className="text-2xl font-bold text-slate-900">{item ? "Редактировать новость" : "Создать новость"}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="h-[calc(100%-156px)] overflow-y-auto bg-slate-50 px-7 py-6">
          {error && <Message tone="error" text={error} />}
          <div className="space-y-5">
            <FormBlock title="Основные данные" description="Заполните заголовок, краткое описание, категорию и аудиторию показа.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Заголовок" required>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Категория">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Краткое описание" required>
                <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className={`${inputClass} min-h-24`} />
              </Field>
              <Field label="Аудитория">
                <select value={form.audience_type} onChange={(e) => setForm({ ...form, audience_type: e.target.value })} className={inputClass}>
                  {audiences.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
                </select>
              </Field>
            </FormBlock>

            <FormBlock title="Фото новости" description="Можно добавить несколько фото и выбрать одно как аватар новости.">
              <ImageUploader
                item={current}
                pendingFiles={pendingFiles}
                pendingCoverIndex={pendingCoverIndex}
                onFiles={(files) => setPendingFiles((existing) => [...existing, ...files])}
                onPendingCover={setPendingCoverIndex}
                onRemovePending={(index) => setPendingFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}
                onCover={chooseCover}
                onRemove={removeImage}
              />
            </FormBlock>

            <FormBlock title="Содержание" description="Текст сохраняется с форматированием для предпросмотра и публикации.">
              <Field label="Текст новости" required>
                <NewsDocumentEditor
                  value={form.body_html}
                  onChange={(html) => setForm((currentForm) => ({
                    ...currentForm,
                    body_json: htmlDocumentJSON(html),
                    body_html: html,
                  }))}
                />
              </Field>
            </FormBlock>

            <FormBlock title="Настройки публикации" description="Выберите дополнительные признаки и время запланированной публикации.">
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.notify_enabled}
                    onChange={(e) => setForm({ ...form, notify_enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100"
                  />
                  Отправить уведомление
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_important}
                    onChange={(e) => setForm({ ...form, is_important: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100"
                  />
                  Важная новость
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_pinned}
                    onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100"
                  />
                  Закрепить
                </label>
                <input
                  type="datetime-local"
                  value={toInputDate(form.scheduled_at)}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className={inputClass}
                />
              </div>
            </FormBlock>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-7 py-4">
          <div className="mr-auto text-sm font-medium text-slate-500">{validation.valid ? "Готово к предпросмотру" : validation.messages[0]}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onClose} className={drawerButtonClass}>Отмена</button>
            <button disabled={saving || !validation.valid} onClick={() => void save("draft")} className={drawerButtonClass}>Сохранить черновик</button>
            <button disabled={saving || !validation.valid} onClick={() => setPreviewOpen(true)} className={drawerPrimaryButtonClass}>
              Предпросмотр
            </button>
          </div>
        </div>
      </aside>
      {previewOpen && (
        <PreviewModal
          form={form}
          item={current}
          pendingFiles={pendingFiles}
          pendingCoverIndex={pendingCoverIndex}
          validation={validation}
          onClose={() => setPreviewOpen(false)}
          onDraft={() => void save("draft")}
          onPublish={() => void save(form.scheduled_at ? "schedule" : "publish")}
        />
      )}
    </div>
  );
}

function ImageUploader({
  item,
  pendingFiles,
  pendingCoverIndex,
  onFiles,
  onPendingCover,
  onRemovePending,
  onCover,
  onRemove,
}: {
  item?: InfocenterNews;
  pendingFiles: File[];
  pendingCoverIndex: number;
  onFiles: (files: File[]) => void;
  onPendingCover: (index: number) => void;
  onRemovePending: (index: number) => void;
  onCover: (imageID: string) => Promise<void>;
  onRemove: (imageID: string) => Promise<void>;
}) {
  const existingCover = item ? coverImage(item) : undefined;
  const pendingCover = pendingFiles[pendingCoverIndexSafe(pendingFiles, pendingCoverIndex)];

  return (
    <div className="mt-4">
      <label className="inline-flex cursor-pointer rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
        + Добавить фото
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={(e) => onFiles(Array.from(e.target.files || []))}
          className="sr-only"
        />
      </label>

      {(existingCover || pendingCover) && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-sm font-bold text-blue-700">Аватар новости</p>
          {pendingCover ? (
            <ImageObjectPreview file={pendingCover} className="h-40 w-full rounded-xl object-cover" />
          ) : (
            <img src={infocenterNewsMediaUrl(existingCover?.file_url)} alt="" className="h-40 w-full rounded-xl object-cover" />
          )}
        </div>
      )}

      {!item?.images.length && pendingFiles.length === 0 && (
        <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Фото пока не добавлены. В карточке будет показана стандартная обложка.
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {item?.images.map((image) => (
          <div
            key={image.id}
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${item.cover_image_id === image.id ? "border-blue-400 ring-4 ring-blue-100" : "border-slate-200"}`}
          >
            <img src={infocenterNewsMediaUrl(image.file_url)} alt="" className="h-24 w-full object-cover" />
            <div className="flex flex-wrap gap-1 p-2">
              <button onClick={() => void onCover(image.id)} className="rounded-xl border px-2 py-1 text-xs font-semibold">
                {item.cover_image_id === image.id ? "Аватар" : "Сделать аватаром"}
              </button>
              <button onClick={() => void onRemove(image.id)} className="rounded-xl border px-2 py-1 text-xs font-semibold text-red-600">Удалить</button>
            </div>
          </div>
        ))}
        {pendingFiles.map((file, index) => (
          <PendingImage
            key={`${file.name}-${index}`}
            file={file}
            active={pendingCoverIndex === index}
            onCover={() => onPendingCover(index)}
            onRemove={() => onRemovePending(index)}
          />
        ))}
      </div>
    </div>
  );
}

function PendingImage({ file, active, onCover, onRemove }: { file: File; active: boolean; onCover: () => void; onRemove: () => void }) {
  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${active ? "border-blue-400 ring-4 ring-blue-100" : "border-slate-200"}`}>
      <ImageObjectPreview file={file} className="h-24 w-full object-cover" />
      <div className="flex flex-wrap gap-1 p-2">
        <button onClick={onCover} className="rounded-xl border px-2 py-1 text-xs font-semibold">{active ? "Аватар" : "Сделать аватаром"}</button>
        <button onClick={onRemove} className="rounded-xl border px-2 py-1 text-xs font-semibold text-red-600">Удалить</button>
      </div>
    </div>
  );
}

function ImageObjectPreview({ file, className }: { file: File; className: string }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" className={className} />;
}

function PreviewModal({
  form,
  item,
  pendingFiles,
  pendingCoverIndex,
  validation,
  onClose,
  onDraft,
  onPublish,
}: {
  form: InfocenterNewsPayload;
  item?: InfocenterNews;
  pendingFiles: File[];
  pendingCoverIndex: number;
  validation: { valid: boolean; messages: string[] };
  onClose: () => void;
  onDraft: () => void;
  onPublish: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  const pendingCover = pendingFiles[pendingCoverIndexSafe(pendingFiles, pendingCoverIndex)];
  const pendingCoverURL = useMemo(() => pendingCover ? URL.createObjectURL(pendingCover) : "", [pendingCover]);
  useEffect(() => () => {
    if (pendingCoverURL) URL.revokeObjectURL(pendingCoverURL);
  }, [pendingCoverURL]);
  const cover = pendingCoverURL || (item ? coverImage(item)?.file_url : "");
  return (
    <Modal title="Предпросмотр новости" onClose={onClose} wide>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-semibold">Как увидит собственник</p>
        <button onClick={() => setMobile((value) => !value)} className="rounded-xl border px-3 py-2 text-sm">{mobile ? "Десктопный вид" : "Мобильный вид"}</button>
      </div>
      <article className={`mx-auto rounded-3xl border border-slate-200 bg-white p-5 ${mobile ? "max-w-sm" : "max-w-3xl"}`}>
        {cover && <img src={infocenterNewsMediaUrl(cover)} alt="" className="mb-4 max-h-72 w-full rounded-2xl object-cover" />}
        <p className="text-sm text-blue-600">{form.category}</p>
        <h2 className="mt-2 text-3xl font-bold">{form.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{formatAstanaDateTime(new Date())} · {audienceLabel(form.audience_type)}</p>
        <p className="mt-4 text-slate-600">{form.summary}</p>
        <div className="news-document-content mt-5" dangerouslySetInnerHTML={{ __html: form.body_html }} />
      </article>
      <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
        <p className="font-semibold">Проверка перед публикацией</p>
        {validation.messages.map((message) => <p key={message} className="mt-1">{message}</p>)}
        <p className="mt-1">Уведомление: {form.notify_enabled ? "будет отправлено" : "не будет отправлено"}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className={drawerButtonClass}>Назад к редактированию</button>
        <button disabled={!validation.valid} onClick={onDraft} className={drawerButtonClass}>Сохранить черновик</button>
        <button disabled={!validation.valid} onClick={onPublish} className={drawerPrimaryButtonClass}>
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
  item: InfocenterNews;
  onClose: () => void;
  onEdit: () => void;
  onConfirm: (action: NonNullable<ConfirmState>["action"]) => void;
}) {
  const cover = coverImage(item);
  return (
    <Modal title="Подробнее" onClose={onClose} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <article>
          <StatusBadge status={item.status} />
          {cover && <img src={infocenterNewsMediaUrl(cover.file_url)} alt="" className="mt-4 max-h-80 w-full rounded-2xl object-cover" />}
          <h2 className="mt-4 text-3xl font-bold">{item.title}</h2>
          <p className="mt-2 text-sm text-slate-500">{item.category} · {audienceLabel(item.audience_type)}</p>
          <p className="mt-2 text-sm text-slate-500">Автор: {item.author_name}</p>
          <p className="mt-2 text-sm text-slate-500">Дата публикации: {item.published_at ? formatAstanaDateTime(item.published_at) : "не опубликована"}</p>
          <div className="news-document-content mt-5" dangerouslySetInnerHTML={{ __html: item.body_html }} />
        </article>
        <aside className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <p>Просмотры: {item.views_count}</p>
            <p>Прочитали: {item.reads_count}</p>
            <p>Уведомление: {item.notify_enabled ? "отправлено / включено" : "нет"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="font-semibold">История действий</p>
            <div className="mt-3 space-y-3 text-sm">
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
        <button onClick={onEdit} className="rounded-xl border px-4 py-2 text-sm font-semibold">Редактировать</button>
        {item.status === "published" && <button onClick={() => onConfirm("hide")} className="rounded-xl border px-4 py-2 text-sm font-semibold">Скрыть</button>}
        {item.status === "hidden" && <button onClick={() => onConfirm("show")} className="rounded-xl border px-4 py-2 text-sm font-semibold">Показать</button>}
        {(item.status === "published" || item.status === "hidden") && <button onClick={() => onConfirm("unpublish")} className="rounded-xl border px-4 py-2 text-sm font-semibold text-red-600">Снять с публикации</button>}
        <button onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Закрыть</button>
      </div>
    </Modal>
  );
}

function ConfirmModal({ state, onClose, onDone }: { state: NonNullable<ConfirmState>; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const meta = confirmMeta(state.action);
  const disabled = state.action === "unpublish" ? !reason.trim() : state.action === "permanent" ? confirmText !== "УДАЛИТЬ" : false;

  async function submit() {
    setError("");
    try {
      if (state.action === "permanent") {
        await permanentDeleteInfocenterNews(state.item.id);
      } else {
        await runInfocenterNewsAction(state.item.id, state.action, { reason });
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    }
  }

  return (
    <Modal title={meta.title} onClose={onClose}>
      <p className="text-slate-600">{meta.text}</p>
      {state.action === "hide" && (
        <Field label="Причина, необязательно">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} min-h-24`} />
        </Field>
      )}
      {state.action === "unpublish" && (
        <Field label="Причина снятия с публикации *">
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
        <button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold">Отмена</button>
        <button disabled={disabled} onClick={() => void submit()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Подтвердить</button>
      </div>
    </Modal>
  );
}

async function uploadPendingFiles(item: InfocenterNews, files: File[], coverIndex: number) {
  let current = item;
  let coverID = "";
  for (let index = 0; index < files.length; index += 1) {
    current = await uploadInfocenterNewsImage(current.id, files[index]);
    const uploaded = current.images[current.images.length - 1];
    if (index === coverIndex) coverID = uploaded?.id || "";
  }
  if (coverID) current = await setInfocenterNewsCover(current.id, coverID);
  return current;
}

function actionsFor(item: InfocenterNews) {
  if (item.status === "draft") return [
    { key: "details", label: "Предпросмотр" },
    { key: "edit", label: "Редактировать" },
    { key: "publish", label: "Опубликовать" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "scheduled") return [
    { key: "publish", label: "Опубликовать сейчас" },
    { key: "edit", label: "Изменить" },
    { key: "cancel-schedule", label: "Отменить расписание" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "published") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "hide", label: "Скрыть" },
    { key: "unpublish", label: "Снять с публикации" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "hidden") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "show", label: "Показать" },
    { key: "unpublish", label: "Снять с публикации" },
    { key: "delete", label: "Удалить" },
  ];
  if (item.status === "unpublished") return [
    { key: "details", label: "Подробнее" },
    { key: "edit", label: "Редактировать" },
    { key: "publish", label: "Опубликовать повторно" },
    { key: "delete", label: "Удалить" },
  ];
  return [
    { key: "restore", label: "Восстановить" },
    { key: "permanent", label: "Удалить навсегда" },
  ];
}

function validateForm(form: InfocenterNewsPayload) {
  const bodyText = stripHtml(form.body_html);
  const messages = [
    form.title.trim() ? "заголовок заполнен" : "заголовок не заполнен",
    form.summary.trim() ? "краткое описание заполнено" : "краткое описание не заполнено",
    bodyText ? "текст заполнен" : "текст не заполнен",
    form.audience_type ? "аудитория выбрана" : "аудитория не выбрана",
  ];
  return {
    valid: Boolean(form.title.trim() && form.summary.trim() && bodyText && form.audience_type),
    messages,
  };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function htmlDocumentJSON(html: string) {
  return {
    type: "tinymce-html",
    html,
  };
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4">
      <section className={`overflow-hidden rounded-3xl bg-white shadow-2xl ${wide ? "w-full max-w-5xl" : "w-full max-w-lg"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full border border-slate-200 px-3 py-2 text-slate-500 hover:bg-slate-50">✕</button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto px-6 py-5">{children}</div>
      </section>
    </div>
  );
}

function FormBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {children}
    </section>
  );
}

function QuickButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="mt-4 block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </div>
  );
}

function Message({ text, tone = "info" }: { text: string; tone?: "info" | "error" }) {
  return <p className={`mb-4 rounded-xl px-4 py-3 text-sm ${tone === "error" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{text}</p>;
}

function StatusBadge({ status }: { status: InfocenterNewsStatus }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{statusLabel(status)}</span>;
}

function statusLabel(status: InfocenterNewsStatus) {
  const labels: Record<InfocenterNewsStatus, string> = {
    draft: "Черновик",
    scheduled: "Запланирована",
    published: "Опубликована",
    hidden: "Скрыта",
    unpublished: "Снята с публикации",
    deleted: "Удалена",
  };
  return labels[status];
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    created: "Создана",
    updated: "Обновлена",
    published: "Опубликована",
    scheduled: "Запланирована",
    schedule_cancelled: "Расписание отменено",
    hidden: "Скрыта",
    shown: "Показана",
    unpublished: "Снята с публикации",
    deleted: "Удалена",
    restored: "Восстановлена",
    permanently_deleted: "Удалена навсегда",
    image_uploaded: "Фото загружено",
    image_deleted: "Фото удалено",
    cover_changed: "Обложка изменена",
  };
  return labels[action] || action;
}

function confirmMeta(action: NonNullable<ConfirmState>["action"]) {
  const map = {
    hide: { title: "Скрыть новость", text: "Новость временно перестанет отображаться у собственников, но останется в системе." },
    show: { title: "Показать новость", text: "Новость снова станет видна собственникам в ленте." },
    unpublish: { title: "Снять с публикации", text: "Новость будет официально снята с публикации и больше не будет доступна собственникам." },
    delete: { title: "Удалить", text: "Новость будет перемещена в раздел «Удаленные». Ее можно будет восстановить." },
    restore: { title: "Восстановить", text: "Новость будет восстановлена как черновик, чтобы случайно не появиться у собственников." },
    permanent: { title: "Удалить навсегда", text: "Это действие нельзя отменить." },
  };
  return map[action];
}

function audienceLabel(value: string) {
  return audiences.find((item) => item.value === value)?.label || value;
}

function coverImage(item: InfocenterNews) {
  return item.images.find((image) => image.id === item.cover_image_id) || item.images[0];
}

function dateLabel(item: InfocenterNews) {
  if (item.status === "scheduled" && item.scheduled_at) return `Запланирована: ${formatAstanaDateTime(item.scheduled_at)}`;
  if (item.published_at) return `Опубликована: ${formatAstanaDateTime(item.published_at)}`;
  return `Создана: ${formatAstanaDateTime(item.created_at)}`;
}

function toInputDate(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function pendingCoverIndexSafe(files: File[], index: number) {
  return files[index] ? index : 0;
}
