"use client";

import type { AuthChangeEvent, AuthError, Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { createClientSupabaseClient } from "../services/api/supabase-client";
import type { UserStatusType } from "../types";

interface SupabaseAuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userStatus: UserStatusType | null;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({
  user: null,
  session: null,
  loading: true,
  userStatus: null,
});

interface SupabaseAuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
  initialUserStatus?: UserStatusType | null;
}

export function SupabaseAuthProvider({
  children,
  initialUser = null,
  initialUserStatus = null,
}: SupabaseAuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [session, setSession] = useState<Session | null>(null);
  const [userStatus] = useState<UserStatusType | null>(initialUserStatus);
  const [loading, setLoading] = useState(!initialUser);

  useEffect(() => {
    const supabase = createClientSupabaseClient();

    // 現在のユーザーを取得（セキュア）
    supabase.auth
      .getUser()
      .then(
        ({ data: { user }, error }: { data: { user: User | null }; error: AuthError | null }) => {
          if (error) {
            console.error("認証エラー:", error);
            setUser(null);
            setSession(null);
          } else {
            setUser(user);
            // getUser()ではsessionは直接取得できないため、getSession()も併用
            supabase.auth
              .getSession()
              .then(
                ({
                  data: { session },
                  error: sessionError,
                }: {
                  data: { session: Session | null };
                  error: AuthError | null;
                }) => {
                  if (sessionError) {
                    console.error("セッション取得エラー:", sessionError);
                  } else {
                    setSession(session);
                  }
                }
              );
          }
          setLoading(false);
        }
      );

    // 認証状態の変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SupabaseAuthContext.Provider value={{ user, session, loading, userStatus }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error("useSupabaseAuth must be used within a SupabaseAuthProvider");
  }
  return context;
};
