"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import { BizdinHouseIllustration, BizdinLogo } from "@/shared/ui/brand";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await apiFetch("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
        }),
      });

      saveToken(data.token);
      router.push("/cabinet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="gd-auth-shell">
      <section className="gd-auth-content">
        <BizdinLogo markSize="lg" />

        <div className="mt-12 space-y-5">
          <h1 className="gd-auth-title">
            Цифровой кабинет ОСИ
          </h1>
          <p className="gd-auth-description">
            Присоединяйтесь к Bizdin Ui, чтобы участвовать в собраниях, голосованиях и управлении домом онлайн.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="gd-auth-card mt-8 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--gd-text-strong)]">
              Регистрация
            </h2>
            <p className="mt-2 text-sm text-[var(--gd-muted)]">
              Создайте аккаунт для доступа к кабинету.
            </p>
          </div>

          <label className="block">
            <span className="gd-label">ФИО</span>
            <input
              className="gd-input"
              placeholder="Фамилия Имя Отчество"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className="block">
            <span className="gd-label">Email</span>
            <input
              className="gd-input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="gd-label">Пароль</span>
            <input
              className="gd-input"
              type="password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error && <p className="gd-alert gd-alert-danger">{error}</p>}

          <button
            className="gd-button gd-button-primary w-full"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Создаём аккаунт..." : "Зарегистрироваться"}
          </button>

          <p className="text-center text-sm text-[var(--gd-muted)]">
            Уже есть аккаунт?{" "}
            <Link className="font-bold text-[var(--gd-primary)]" href="/login">
              Войти
            </Link>
          </p>
        </form>
      </section>

      <section className="gd-auth-visual">
        <BizdinHouseIllustration />
      </section>
    </main>
  );
}
