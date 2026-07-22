import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { supabase } from "../lib/supabase";
import type { Profile } from "../types/domain";
import { configurePurchases, resetPurchasesUser } from "../lib/purchases";
import { analytics } from "../lib/analytics";
import { captureException } from "../lib/observability";
import { reconcilePlanAccess } from "../features/subscription/api";
import { queryClient, qk } from "../lib/query";
import { clearPendingProofs } from "../lib/upload-queue";

const PROFILE_LOAD_MESSAGE =
  "CalledOut could not load your account. Check your connection and try again.";

type Value = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Value | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    setProfile(data as Profile | null);
  }, []);

  const refreshProfile = useCallback(async () => {
    setError(null);
    const user = (await supabase.auth.getUser()).data.user;

    if (!user) {
      setProfile(null);
      return;
    }

    try {
      await loadProfile(user.id);
    } catch (cause) {
      captureException(cause, { area: "profile_refresh" });
      setError(PROFILE_LOAD_MESSAGE);
      throw cause;
    }
  }, [loadProfile]);

  const activateSession = useCallback(
    async (next: Session | null) => {
      setSession(next);
      setProfile(null);
      setError(null);

      if (!next) return;

      try {
        await loadProfile(next.user.id);
      } catch (cause) {
        captureException(cause, { area: "profile_load" });
        setError(PROFILE_LOAD_MESSAGE);
        return;
      }

      analytics.identify(next.user.id);
      await configurePurchases(next.user.id).catch((cause) =>
        captureException(cause, { area: "revenuecat_login" }),
      );

      reconcilePlanAccess()
        .then((plan) => queryClient.setQueryData(qk.plan, plan))
        .catch((cause) =>
          captureException(cause, { area: "subscription_reconcile_login" }),
        );
    },
    [loadProfile],
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (mounted) await activateSession(data.session);
      })
      .catch((cause) => {
        captureException(cause, { area: "session_bootstrap" });
        if (mounted) setError("CalledOut could not restore your session.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      activateSession(next)
        .catch((cause) =>
          captureException(cause, { area: "auth_state_change" }),
        )
        .finally(() => {
          if (mounted) setLoading(false);
        });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [activateSession]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;

      loadProfile(userId).catch((cause) =>
        captureException(cause, { area: "profile_refresh_foreground" }),
      );

      reconcilePlanAccess()
        .then((plan) => queryClient.setQueryData(qk.plan, plan))
        .catch((cause) =>
          captureException(cause, {
            area: "subscription_reconcile_foreground",
          }),
        );
    });

    return () => subscription.remove();
  }, [session?.user.id, loadProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      error,
      refreshProfile,
      signOut: async () => {
        const userId = session?.user.id;
        if (userId) {
          await clearPendingProofs(userId).catch((cause) =>
            captureException(cause, { area: "proof_queue_logout_cleanup" }),
          );
        }
        await resetPurchasesUser().catch((cause) =>
          captureException(cause, { area: "revenuecat_logout" }),
        );
        await supabase.auth.signOut();
        setProfile(null);
        setError(null);
        analytics.reset();
      },
    }),
    [session, profile, loading, error, refreshProfile],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
