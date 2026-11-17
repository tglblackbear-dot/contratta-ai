import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { clearOfflineUserData } from "../../lib/offlineInterviews";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const queryClient = useQueryClient();
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    let receivedAuthEvent = false;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      const nextUserId = nextSession?.user.id ?? null;
      const previousUserId = activeUserId.current;
      if (previousUserId && previousUserId !== nextUserId) {
        queryClient.clear();
        void clearOfflineUserData(previousUserId).catch((cleanupError: unknown) => {
          console.error("Não foi possível apagar o cache offline após a troca de conta.", cleanupError);
        });
      }
      activeUserId.current = nextUserId;
      setSession(nextSession);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("Não foi possível restaurar a sessão.", error);
      if (receivedAuthEvent) return;
      setSession(data.session);
      activeUserId.current = data.session?.user.id ?? null;
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo(() => ({ session, user: session?.user ?? null, loading }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
