"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import { BizdinHouseIllustration, BizdinLogo } from "@/shared/ui/brand";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const data = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      saveToken(data.token);
      router.push("/cabinet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    }
  }

  return (
    <main className="gd-auth-shell">
      <section className="gd-auth-content">
        <BizdinLogo markSize="lg" />

        <div className="mt-12 space-y-5">
          <h1 className="gd-auth-title">
            Ваш дом. Ваш голос.
            <br />
            <span className="gd-auth-title-accent">Наше общее решение.</span>
          </h1>
          <p className="gd-auth-description">
            Общедомовые собрания, голосования, новости и управление домом - в одном приложении.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="gd-auth-card mt-8 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--gd-text-strong)]">
              Вход в систему
            </h2>
            <p className="mt-2 text-sm text-[var(--gd-muted)]">
              Войдите в цифровой кабинет ОСИ.
            </p>
          </div>

          <label className="block">
            <span className="gd-label">Email</span>
            <input
              className="gd-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              type="email"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="gd-label">Пароль</span>
            <input
              className="gd-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              autoComplete="current-password"
            />
          </label>

          {error && <p className="gd-alert gd-alert-danger">{error}</p>}

          <button className="gd-button gd-button-primary w-full" type="submit">
            Войти в систему
          </button>

          <p className="text-center text-sm text-[var(--gd-muted)]">
            Нет аккаунта?{" "}
            <Link className="font-bold text-[var(--gd-primary)]" href="/register">
              Зарегистрироваться
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
