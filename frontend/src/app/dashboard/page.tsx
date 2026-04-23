"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, removeToken } from "@/lib/auth";
import type { User } from "@/types/user";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    apiFetch("/api/v1/auth/me")
      .then(setUser)
      .catch(() => {
        removeToken();
        router.push("/login");
      });
  }, []);

  function logout() {
    removeToken();
    router.push("/login");
  }

  if (!user) return <div className="p-6">Загрузка...</div>;

  return (
    <main className="p-6">
      <h1 className="text-xl mb-4">Личный кабинет</h1>

      <p><b>ФИО:</b> {user.full_name}</p>
      <p><b>Email:</b> {user.email}</p>
      <p><b>Роли:</b> {user.roles.join(", ")}</p>

      <button onClick={logout} className="mt-4 border px-4 py-2">
        Выйти
      </button>

      {user.roles.includes("OWNER") && (
        <div className="mt-6 border p-4">
          <h2>Голосования</h2>
          <p>Пока заглушка</p>
        </div>
      )}
    </main>
  );
}