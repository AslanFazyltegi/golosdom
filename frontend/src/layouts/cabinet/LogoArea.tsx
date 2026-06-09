export function LogoArea() {
  return (
    <div className="hidden h-12 items-center gap-3 rounded-2xl border border-[var(--gd-border)] bg-[var(--gd-surface)] px-3 shadow-sm sm:flex">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--gd-primary)] text-sm font-black text-white">
        G
      </div>
      <div className="leading-tight">
        <p className="text-sm font-black text-[var(--gd-text-strong)]">
          Golosdom
        </p>
        <p className="text-[11px] font-semibold text-[var(--gd-muted)]">
          Cabinet
        </p>
      </div>
    </div>
  );
}
