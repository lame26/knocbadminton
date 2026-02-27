import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { API_BASE } from "../config/apiBase";

export interface AuthUser {
  emp_id: string;
  name: string;
  role: string; // "player" | "admin" | "super_admin"
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (emp_id: string, pin: string) => Promise<{ is_first_login: boolean }>;
  logout: () => void;
  isAdmin: boolean;
}

const TOKEN_KEY = "knoc_token";
const USER_KEY = "knoc_user";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  // 토큰 만료 확인 (앱 시작 시)
  useEffect(() => {
    if (!token) return;
    // JWT payload 디코딩해서 exp 확인
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        logout();
      }
    } catch {
      logout();
    }
  }, []);

  async function login(emp_id: string, pin: string): Promise<{ is_first_login: boolean }> {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emp_id, pin }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "로그인 실패" }));
      throw new Error((err as { error: string }).error ?? "로그인 실패");
    }

    const data = await res.json() as { token: string; user: AuthUser; is_first_login: boolean };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return { is_first_login: data.is_first_login };
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
