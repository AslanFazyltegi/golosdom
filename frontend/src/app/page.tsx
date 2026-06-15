import Link from "next/link";
import { BizdinHouseIllustration, BizdinLogo } from "@/shared/ui/brand";

export default function HomePage() {
  return (
    <main className="gd-auth-shell">
      <section className="gd-auth-content">
        <BizdinLogo markSize="lg" />

        <div className="mt-12 space-y-6">
          <h1 className="gd-auth-title">
            Ваш дом. Ваш голос.
            <br />
            <span className="gd-auth-title-accent">Наше общее решение.</span>
          </h1>
          <p className="gd-auth-description">
            Общедомовые собрания, голосования, новости и управление домом - в одном приложении.
          </p>
        </div>

        <div className="gd-auth-actions mt-8">
          <Link className="gd-button gd-button-primary" href="/login">
            Войти в систему
          </Link>
          <Link className="gd-button" href="/register">
            Зарегистрироваться
          </Link>
        </div>

        <div className="mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            "Прозрачность и доверие",
            "Законность и безопасность",
            "Удобство онлайн",
            "Участие каждого собственника",
          ].map((item) => (
            <div key={item} className="gd-card flex items-center gap-3 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--gd-accent-soft)] text-sm font-black text-[var(--gd-accent-dark)]">
                ✓
              </span>
              <span className="font-bold text-[var(--gd-text-strong)]">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="gd-auth-visual">
        <BizdinHouseIllustration />
      </section>
    </main>
  );
}
