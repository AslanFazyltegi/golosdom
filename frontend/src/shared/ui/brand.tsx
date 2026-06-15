"use client";

import type { HTMLAttributes } from "react";

const BIZDIN_LOGO_SRC = "/brand/bizdin-ui-logo-horizontal.png";
const BIZDIN_MARK_SRC = "/icons/bizdin-ui-mark-512.png";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function BizdinBrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cx("gd-brand-mark", `gd-brand-mark-${size}`, className)}
      aria-hidden="true"
    >
      <img className="gd-brand-mark-image" src={BIZDIN_MARK_SRC} alt="" />
    </span>
  );
}

export function BizdinLogo({
  className,
  compact = false,
  markSize = "md",
}: {
  className?: string;
  compact?: boolean;
  markSize?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cx(
        "gd-brand-logo",
        `gd-brand-logo-${markSize}`,
        compact && "gd-brand-logo-compact",
        className,
      )}
    >
      {compact ? (
        <BizdinBrandMark size={markSize} />
      ) : (
        <img
          className="gd-brand-logo-image"
          src={BIZDIN_LOGO_SRC}
          alt="Bizdin Ui - Цифровой кабинет ОСИ"
        />
      )}
    </div>
  );
}

export function BizdinHouseIllustration({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("gd-house-illustration", className)} aria-hidden="true" {...props}>
      <div className="gd-house-ornament" />
      <div className="gd-house-sun" />
      <div className="gd-house-building gd-house-building-main">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="gd-house-building gd-house-building-side">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="gd-house-yard">
        <span className="gd-house-tree" />
        <span className="gd-house-path" />
        <span className="gd-house-tree gd-house-tree-small" />
      </div>
      <div className="gd-house-vote-card">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
