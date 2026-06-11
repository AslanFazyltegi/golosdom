"use client";

import { apiFetch } from "@/lib/api";

export type InterfaceLanguage = "ru" | "kk";
export type ThemeMode = "light" | "dark" | "system";

export type SystemSettingsState = {
  language: InterfaceLanguage;
  theme: ThemeMode;
  systemNotifications: boolean;
  emailNotifications: boolean;
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
  repeat_password: string;
};

export const SYSTEM_SETTINGS_STORAGE_KEY = "golosdom.systemSettings";
export const LEGACY_THEME_STORAGE_KEY = "golosdom-theme";
export const SYSTEM_SETTINGS_CHANGED_EVENT = "golosdom-system-settings-changed";

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsState = {
  language: "ru",
  theme: "light",
  systemNotifications: true,
  emailNotifications: false,
};

const originalTextNodes = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

let languageObserver: MutationObserver | null = null;

export function loadSystemSettings(): SystemSettingsState {
  if (typeof window === "undefined") return DEFAULT_SYSTEM_SETTINGS;

  const raw = window.localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);

  if (!raw) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      theme: isThemeMode(legacyTheme) ? legacyTheme : DEFAULT_SYSTEM_SETTINGS.theme,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SystemSettingsState>;
    return normalizeSettings(parsed, legacyTheme);
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export function saveSystemSettings(
  next: SystemSettingsState,
): SystemSettingsState {
  if (typeof window === "undefined") return next;

  const normalized = normalizeSettings(next, null);
  window.localStorage.setItem(
    SYSTEM_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalized),
  );

  if (normalized.theme === "system") {
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, normalized.theme);
  }

  applySystemSettings(normalized);
  window.dispatchEvent(
    new CustomEvent(SYSTEM_SETTINGS_CHANGED_EVENT, { detail: normalized }),
  );

  return normalized;
}

export function applySystemSettings(settings = loadSystemSettings()) {
  applyTheme(settings.theme);
  applyLanguage(settings.language);
}

export function startSystemSettingsSync() {
  if (typeof window === "undefined") return () => {};

  applySystemSettings();
  startLanguageObserver();

  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

  function syncFromStorage() {
    applySystemSettings(loadSystemSettings());
  }

  function handleSystemThemeChange() {
    if (loadSystemSettings().theme === "system") {
      applyTheme("system");
    }
  }

  window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncFromStorage);
  window.addEventListener("storage", syncFromStorage);
  mediaQuery?.addEventListener("change", handleSystemThemeChange);

  return () => {
    window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, syncFromStorage);
    window.removeEventListener("storage", syncFromStorage);
    mediaQuery?.removeEventListener("change", handleSystemThemeChange);
    languageObserver?.disconnect();
    languageObserver = null;
  };
}

export function systemNotificationsEnabled() {
  return loadSystemSettings().systemNotifications;
}

export async function changePassword(payload: ChangePasswordPayload) {
  return apiFetch("/api/v1/profile/password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function endOtherSessions() {
  return apiFetch("/api/v1/profile/sessions/end-others", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

function normalizeSettings(
  settings: Partial<SystemSettingsState>,
  legacyTheme: string | null,
): SystemSettingsState {
  return {
    language: settings.language === "kk" ? "kk" : "ru",
    theme: isThemeMode(settings.theme)
      ? settings.theme
      : isThemeMode(legacyTheme)
        ? legacyTheme
        : DEFAULT_SYSTEM_SETTINGS.theme,
    systemNotifications:
      typeof settings.systemNotifications === "boolean"
        ? settings.systemNotifications
        : DEFAULT_SYSTEM_SETTINGS.systemNotifications,
    emailNotifications:
      typeof settings.emailNotifications === "boolean"
        ? settings.emailNotifications
        : DEFAULT_SYSTEM_SETTINGS.emailNotifications,
  };
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function applyTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;

  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = theme;
}

function applyLanguage(language: InterfaceLanguage) {
  if (typeof document === "undefined") return;

  document.documentElement.lang = language === "kk" ? "kk" : "ru";
  document.documentElement.dataset.language = language;
  translateRoot(document.body, language);
}

function startLanguageObserver() {
  if (typeof window === "undefined" || languageObserver) return;

  languageObserver = new MutationObserver((mutations) => {
    const language = loadSystemSettings().language;

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target as Text, language);
        continue;
      }

      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        translateElementAttributes(mutation.target, language);
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (node instanceof Text) {
          translateTextNode(node, language);
        } else if (node instanceof Element) {
          translateRoot(node, language);
        }
      }
    }
  });

  languageObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["aria-label", "placeholder", "title"],
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function translateRoot(root: Element | null, language: InterfaceLanguage) {
  if (!root || shouldSkipElement(root)) return;

  translateElementAttributes(root, language);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node instanceof Element) {
          return shouldSkipElement(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) {
      translateTextNode(node, language);
    }
    node = walker.nextNode();
  }

  for (const element of root.querySelectorAll("[aria-label], [placeholder], [title]")) {
    translateElementAttributes(element, language);
  }
}

function translateTextNode(node: Text, language: InterfaceLanguage) {
  const parent = node.parentElement;
  if (!parent || shouldSkipElement(parent)) return;

  const original = originalTextNodes.get(node) ?? node.nodeValue ?? "";
  if (!originalTextNodes.has(node)) {
    originalTextNodes.set(node, original);
  }

  const translated = translateValue(original, language);
  if (node.nodeValue !== translated) {
    node.nodeValue = translated;
  }
}

function translateElementAttributes(
  element: Element,
  language: InterfaceLanguage,
) {
  if (shouldSkipElementAttributes(element)) return;

  for (const attribute of ["aria-label", "placeholder", "title"]) {
    const value = element.getAttribute(attribute);
    if (!value) continue;

    let attributes = originalAttributes.get(element);
    if (!attributes) {
      attributes = new Map();
      originalAttributes.set(element, attributes);
    }

    const original = attributes.get(attribute) ?? value;
    attributes.set(attribute, original);
    const translated = translateValue(original, language);
    if (value !== translated) {
      element.setAttribute(attribute, translated);
    }
  }
}

function shouldSkipElement(element: Element) {
  const tagName = element.tagName.toLowerCase();
  if (["script", "style", "textarea", "input"].includes(tagName)) return true;
  if (element.closest("[data-no-translate]")) return true;
  if (element.closest("[contenteditable='true']")) return true;
  if (element.closest(".news-document-content, .infocenter-document-content, .tox")) {
    return true;
  }

  return false;
}

function shouldSkipElementAttributes(element: Element) {
  const tagName = element.tagName.toLowerCase();
  if (["script", "style"].includes(tagName)) return true;
  if (element.closest("[data-no-translate]")) return true;
  if (element.closest("[contenteditable='true']")) return true;
  if (element.closest(".news-document-content, .infocenter-document-content, .tox")) {
    return true;
  }

  return false;
}

function translateValue(value: string, language: InterfaceLanguage) {
  if (language === "ru") return value;

  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.trim();
  const translated = KK_TRANSLATIONS[core];

  return translated ? `${leading}${translated}${trailing}` : value;
}

const KK_TRANSLATIONS: Record<string, string> = {
  "Golosdom": "Golosdom",
  "единый кабинет дома": "үйдің бірыңғай кабинеті",
  "Кабинет": "Кабинет",
  "Кабинет пользователя": "Пайдаланушы кабинеті",
  "Загрузка...": "Жүктелуде...",
  "Обновляем данные...": "Деректер жаңартылуда...",
  "Закрыть": "Жабу",
  "Отмена": "Болдырмау",
  "Сохранить": "Сақтау",
  "Сохранение...": "Сақталуда...",
  "Редактировать": "Өңдеу",
  "Выбрать": "Таңдау",
  "Удалить": "Жою",
  "Профиль": "Профиль",
  "Настройки": "Баптаулар",
  "Настройки системы": "Жүйе баптаулары",
  "Интерфейс": "Интерфейс",
  "Язык интерфейса": "Интерфейс тілі",
  "Русский": "Орысша",
  "Қазақша": "Қазақша",
  "Тема оформления": "Безендіру тақырыбы",
  "Светлая": "Жарық",
  "Тёмная": "Қараңғы",
  "Темная тема": "Қараңғы тақырып",
  "Светлая тема": "Жарық тақырып",
  "Системная": "Жүйелік",
  "Уведомления": "Хабарламалар",
  "Системные уведомления": "Жүйелік хабарламалар",
  "Email-уведомления": "Email хабарламалары",
  "Безопасность": "Қауіпсіздік",
  "Сменить пароль": "Құпиясөзді өзгерту",
  "Текущий пароль": "Ағымдағы құпиясөз",
  "Новый пароль": "Жаңа құпиясөз",
  "Повтор нового пароля": "Жаңа құпиясөзді қайталау",
  "Новый пароль должен содержать минимум 8 символов.": "Жаңа құпиясөз кемінде 8 таңбадан тұруы керек.",
  "Заполните все поля смены пароля.": "Құпиясөзді өзгерту өрістерінің бәрін толтырыңыз.",
  "Новый пароль должен быть не короче 8 символов.": "Жаңа құпиясөз кемінде 8 таңбадан тұруы керек.",
  "Новый пароль и повтор должны совпадать.": "Жаңа құпиясөз бен қайталау сәйкес болуы керек.",
  "Не удалось изменить пароль": "Құпиясөзді өзгерту мүмкін болмады",
  "Завершить другие сессии": "Басқа сеанстарды аяқтау",
  "Завершение...": "Аяқталуда...",
  "Не удалось завершить другие сеансы": "Басқа сеанстарды аяқтау мүмкін болмады",
  "Другие сеансы завершены": "Басқа сеанстар аяқталды",
  "Пароль изменён": "Құпиясөз өзгертілді",
  "Настройки сохранены": "Баптаулар сақталды",
  "Пользователь": "Пайдаланушы",
  "Пользователь:": "Пайдаланушы:",
  "email не указан": "email көрсетілмеген",
  "Собственник": "Меншік иесі",
  "Председатель ОСИ": "МИБ төрағасы",
  "Член совета дома": "Үй кеңесінің мүшесі",
  "Ревизор": "Тексеруші",
  "Член ревизионной комиссии": "Тексеру комиссиясының мүшесі",
  "Администратор": "Әкімші",
  "Администратор системы": "Жүйе әкімшісі",
  "ФИО": "ТАӘ",
  "ФИО не указано": "ТАӘ көрсетілмеген",
  "Email": "Email",
  "Телефон": "Телефон",
  "Телефон не указан": "Телефон көрсетілмеген",
  "Фото": "Фото",
  "Выбрать фото": "Фото таңдау",
  "Удалить фото": "Фотоны жою",
  "Допустимые форматы: jpg, jpeg, png, webp.": "Рұқсат етілген форматтар: jpg, jpeg, png, webp.",
  "Допустимые форматы фото: jpg, jpeg, png, webp.": "Фотоның рұқсат етілген форматтары: jpg, jpeg, png, webp.",
  "Не удалось прочитать файл фото.": "Фото файлын оқу мүмкін болмады.",
  "Размер фото не должен превышать 2 МБ.": "Фото өлшемі 2 МБ-тан аспауы керек.",
  "Размер фото не должен превышать 2 МБ": "Фото өлшемі 2 МБ-тан аспауы керек",
  "Редактировать личные данные": "Жеке деректерді өңдеу",
  "Email показывается только для просмотра.": "Email тек қарау үшін көрсетіледі.",
  "нельзя изменить": "өзгертуге болмайды",
  "Личные данные": "Жеке деректер",
  "Данные учетной записи из БД": "ДҚ-дағы есептік жазба деректері",
  "Активная роль": "Белсенді рөл",
  "Мои роли": "Менің рөлдерім",
  "Доступные роли пользователя": "Пайдаланушыға қолжетімді рөлдер",
  "Роли пользователя пока не указаны.": "Пайдаланушы рөлдері әлі көрсетілмеген.",
  "Мой дом / ОСИ": "Менің үйім / МИБ",
  "Мой МЖК": "Менің МЖК",
  "Мои объекты": "Менің объектілерім",
  "Краткая информация по дому и обслуживающему ОСИ": "Үй және қызмет көрсететін МИБ туралы қысқаша ақпарат",
  "Данные ОСИ пока не указаны.": "МИБ деректері әлі көрсетілмеген.",
  "Председатель": "Төраға",
  "Управляемые дома:": "Басқарылатын үйлер:",
  "Дома для этого ОСИ пока не указаны.": "Бұл МИБ үшін үйлер әлі көрсетілмеген.",
  "Сменить роль": "Рөлді өзгерту",
  "Активная роль:": "Белсенді рөл:",
  "Выход": "Шығу",
  "Открыть меню": "Мәзірді ашу",
  "Закрыть меню": "Мәзірді жабу",
  "Развернуть меню": "Мәзірді ашу",
  "Свернуть меню": "Мәзірді жию",
  "Важные события": "Маңызды оқиғалар",
  "Помощь": "Көмек",
  "Важных событий нет": "Маңызды оқиғалар жоқ",
  "Поддержка": "Қолдау",
  "Вопросы по кабинетам, голосованиям и профилю.": "Кабинеттер, дауыс берулер және профиль бойынша сұрақтар.",
  "Текущий кабинет:": "Ағымдағы кабинет:",
  "Раздел:": "Бөлім:",
  "Используйте левое меню для перехода между разделами. Доступные действия зависят от роли и текущего статуса записей в разделе.": "Бөлімдер арасында өту үшін сол жақ мәзірді пайдаланыңыз. Қолжетімді әрекеттер рөлге және жазбалардың ағымдағы мәртебесіне байланысты.",
  "На дашборде собраны ключевые показатели и быстрые переходы.": "Дашбордта негізгі көрсеткіштер мен жылдам өтулер жиналған.",
  "Главная": "Басты бет",
  "Дашборд": "Дашборд",
  "Инфоцентр": "Ақпарат орталығы",
  "Новости": "Жаңалықтар",
  "Объявления": "Хабарландырулар",
  "Голосования": "Дауыс берулер",
  "Свод голосований": "Дауыс берулер жиынтығы",
  "Общедомовые собрания": "Жалпы үй жиналыстары",
  "Собрания": "Жиналыстар",
  "Создать собрание": "Жиналыс құру",
  "Активные": "Белсенді",
  "Предстоящие": "Алдағы",
  "Прошедшие": "Өткен",
  "Конструктор голосования": "Дауыс беру конструкторы",
  "Создать опросник": "Сауалнама құру",
  "Черновики": "Жобалар",
  "На доработке": "Толықтыруда",
  "На утверждении": "Бекітуде",
  "На утверждении у совета дома": "Үй кеңесінің бекітуінде",
  "Ожидающие публикации": "Жариялауды күтуде",
  "Опубликованные": "Жарияланған",
  "Активные голосования": "Белсенді дауыс берулер",
  "Завершенные голосования": "Аяқталған дауыс берулер",
  "Активные собрания": "Белсенді жиналыстар",
  "Предстоящие собрания": "Алдағы жиналыстар",
  "Прошедшие собрания": "Өткен жиналыстар",
  "Черновик": "Жоба",
  "Черновик сохранён": "Жоба сақталды",
  "Активно": "Белсенді",
  "Завершено": "Аяқталды",
  "Опубликовано": "Жарияланды",
  "Запланировано": "Жоспарланған",
  "Отправляется": "Жіберілуде",
  "Ошибка отправки": "Жіберу қатесі",
  "Пусто": "Бос",
  "Нет данных": "Деректер жоқ",
  "Поиск": "Іздеу",
  "Создать": "Құру",
  "Добавить": "Қосу",
  "Отправить": "Жіберу",
  "Опубликовать": "Жариялау",
  "Предпросмотр": "Алдын ала қарау",
  "Сохранить как черновик": "Жоба ретінде сақтау",
  "Завершить": "Аяқтау",
  "Подробнее": "Толығырақ",
  "Назад": "Артқа",
  "Да": "Иә",
  "Нет": "Жоқ",
  "Воздержался": "Қалыс қалды",
};
