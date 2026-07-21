import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types/domain";
import { configurePurchases } from "../lib/purchases";
import { analytics } from "../lib/analytics";
type Value = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};
const C = createContext<Value | undefined>(undefined);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshProfile = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    setProfile(data as Profile | null);
  };
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        await refreshProfile();
        analytics.identify(data.session.user.id);
        await configurePurchases(data.session.user.id);
      }
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) {
        await refreshProfile();
        await configurePurchases(next.user.id);
      } else setProfile(null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      refreshProfile,
      signOut: async () => {
        await supabase.auth.signOut();
        analytics.reset();
      },
    }),
    [session, profile, loading],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
export function useSession() {
  const v = useContext(C);
  if (!v) throw new Error("SessionProvider missing");
  return v;
}
