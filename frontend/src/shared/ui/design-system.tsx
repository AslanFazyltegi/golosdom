"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Tone = "blue" | "emerald" | "amber" | "red" | "violet" | "slate";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AppButton({
  children,
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      type="button"
      className={cx(
        "gd-button",
        variant === "primary" && "gd-button-primary",
        variant === "danger" && "gd-button-danger",
        variant === "ghost" && "border-transparent bg-transparent shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AppCard({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "article" | "div" | "section";
}) {
  return <Tag className={cx("gd-card", className)}>{children}</Tag>;
}

export function AppBadge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cx("gd-badge", `gd-status-${tone}`, className)}>{children}</span>;
}

export function AppStatusPill({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cx("gd-status-pill", `gd-status-${tone}`, className)}>
      {children}
    </span>
  );
}

export function AppPageHeader({
  title,
  description,
  kicker,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("gd-page-header", className)}>
      <div className="min-w-0">
        {kicker && <p className="gd-page-kicker text-sm font-bold">{kicker}</p>}
        <h1 className="gd-page-title">{title}</h1>
        {description && <p className="gd-page-description mt-2 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function AppModal({
  title,
  children,
  footer,
  onClose,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className="gd-modal-overlay">
      <div className={cx("gd-modal-panel", className)}>
        <div className="gd-modal-header">
          <h2 className="text-xl font-bold text-[var(--gd-text-strong)]">{title}</h2>
          {onClose && (
            <AppButton variant="secondary" onClick={onClose}>
              Закрыть
            </AppButton>
          )}
        </div>
        <div className="gd-modal-body">{children}</div>
        {footer && <div className="gd-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function AppTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("gd-tabs", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cx("gd-tab", value === item.value && "gd-tab-active")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function AppFormField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="gd-label">{label}</span>}
      {children}
      {hint && !error && <span className="gd-hint">{hint}</span>}
      {error && <span className="gd-error">{error}</span>}
    </label>
  );
}

export function AppSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("gd-input", className)} {...props} />;
}

export function AppTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("gd-input min-h-28", className)} {...props} />;
}

export function AppInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("gd-input", className)} {...props} />;
}

export function AppDropdownMenu({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("gd-card p-2", className)}>{children}</div>;
}

export function AppEmptyState({
  title,
  text,
  action,
  className,
}: {
  title?: ReactNode;
  text: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("gd-empty-state", className)}>
      {title && <h2 className="text-lg font-bold text-[var(--gd-text-strong)]">{title}</h2>}
      <p className={cx(Boolean(title) && "mt-2", "text-sm")}>{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AppResponsiveTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("gd-responsive-table", className)}>{children}</div>;
}

export function AppSkeleton({ className = "h-10 w-full" }: { className?: string }) {
  return <div className={cx("gd-skeleton", className)} aria-hidden="true" />;
}

export function VotingQuestionCard({
  number,
  text,
  children,
  invalid,
  className,
  mode = "preview",
}: {
  number: number;
  text: ReactNode;
  children?: ReactNode;
  invalid?: boolean;
  className?: string;
  mode?: "preview" | "answer" | "details";
}) {
  return (
    <fieldset
      className={cx(
        "gd-voting-question-card",
        `gd-voting-question-card-${mode}`,
        invalid && "border-red-300 bg-red-50/40",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="gd-voting-question-number" aria-hidden="true">
          {number}
        </span>
        <legend className="gd-voting-question-text min-w-0">
          <span className="sr-only">Вопрос {number}: </span>
          {text}
        </legend>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </fieldset>
  );
}
