/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { buildAppUrl, isXamppMode } from "@/lib/appConfig";
import { clearXamppToken, getXamppToken, setXamppToken, xamppApiRequest } from "@/lib/xamppApi";

export type AppRole = "admin" | "trainer" | "trainee";

export interface AppUser {
  id: string;
  email?: string;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  user_metadata?: {
    full_name?: string;
    [key: string]: unknown;
  };
}

export interface AppSession {
  access_token?: string;
  user: AppUser | null;
}

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  role: AppRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

interface XamppAuthUserResponse {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role: AppRole;
}

interface XamppAuthResponse {
  token: string;
  user: XamppAuthUserResponse;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapSupabaseUser = (user: User | null): AppUser | null => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata as AppUser["user_metadata"],
  };
};

const mapSupabaseSession = (session: Session | null): AppSession | null => {
  if (!session) {
    return null;
  }

  return {
    access_token: session.access_token,
    user: mapSupabaseUser(session.user),
  };
};

const mapXamppUser = (user: XamppAuthUserResponse): AppUser => ({
  id: user.id,
  email: user.email,
  full_name: user.full_name,
  phone: user.phone ?? null,
  avatar_url: user.avatar_url ?? null,
  user_metadata: {
    full_name: user.full_name ?? undefined,
  },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isXamppMode) {
      const token = getXamppToken();
      if (!token) {
        setLoading(false);
        return;
      }

      xamppApiRequest<{ user: XamppAuthUserResponse }>("/auth/me")
        .then((response) => {
          const mappedUser = mapXamppUser(response.user);
          setUser(mappedUser);
          setSession({ access_token: token, user: mappedUser });
          setRole(response.user.role);
        })
        .catch(() => {
          clearXamppToken();
          setUser(null);
          setSession(null);
          setRole(null);
        })
        .finally(() => {
          setLoading(false);
        });

      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const mappedUser = mapSupabaseUser(nextSession?.user ?? null);
      setSession(mapSupabaseSession(nextSession));
      setUser(mappedUser);

      if (nextSession?.user) {
        setTimeout(() => {
          fetchUserRole(nextSession.user.id);
        }, 0);
      } else {
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(mapSupabaseSession(existingSession));
      setUser(mapSupabaseUser(existingSession?.user ?? null));

      if (existingSession?.user) {
        fetchUserRole(existingSession.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!error && data) {
      setRole(data.role as AppRole);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, selectedRole: AppRole) => {
    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<XamppAuthResponse>("/auth/register", {
          method: "POST",
          skipAuth: true,
          body: {
            email,
            password,
            full_name: fullName,
            role: selectedRole,
          },
        });

        const mappedUser = mapXamppUser(response.user);
        setXamppToken(response.token);
        setUser(mappedUser);
        setSession({ access_token: response.token, user: mappedUser });
        setRole(response.user.role);
        return { error: null };
      }

      const redirectUrl = buildAppUrl("/");
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            role: selectedRole,
          },
        },
      });

      return { error: error as Error | null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error("Failed to register") };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      if (isXamppMode) {
        const response = await xamppApiRequest<XamppAuthResponse>("/auth/login", {
          method: "POST",
          skipAuth: true,
          body: { email, password },
        });

        const mappedUser = mapXamppUser(response.user);
        setXamppToken(response.token);
        setUser(mappedUser);
        setSession({ access_token: response.token, user: mappedUser });
        setRole(response.user.role);
        return { error: null };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return { error: error as Error | null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error("Failed to sign in") };
    }
  };

  const signOut = async () => {
    if (isXamppMode) {
      try {
        await xamppApiRequest<{ message: string }>("/auth/logout", {
          method: "POST",
        });
      } catch {
        // Ignore logout transport errors and clear local auth state anyway.
      }

      clearXamppToken();
      setUser(null);
      setSession(null);
      setRole(null);
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
