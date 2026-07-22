import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "../providers/app-providers";
import { useSession } from "../providers/session";
import { Button, EmptyState, Loading, Screen } from "../components/ui";

function Guard() {
  const { session, profile, loading, error, refreshProfile, signOut } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || error) return;

    const group = String(segments[0] ?? "");
    const isPublicLegalRoute = group === "legal";
    const isRestrictedRoute = group === "account-restricted";
    const isRestrictedAccount = Boolean(
      session && profile && profile.account_status !== "active",
    );

    if (!session && group !== "(auth)" && !isPublicLegalRoute) {
      router.replace("/(auth)");
    } else if (
      isRestrictedAccount &&
      !isRestrictedRoute &&
      !isPublicLegalRoute
    ) {
      router.replace("/account-restricted" as never);
    } else if (
      session &&
      !isRestrictedAccount &&
      !profile?.onboarding_completed_at &&
      group !== "(onboarding)" &&
      !isPublicLegalRoute
    ) {
      router.replace("/(onboarding)");
    } else if (
      session &&
      !isRestrictedAccount &&
      profile?.onboarding_completed_at &&
      (group === "(auth)" || group === "(onboarding)" || isRestrictedRoute)
    ) {
      router.replace("/(tabs)");
    }
  }, [session, profile, loading, error, segments, router]);

  if (loading) return <Loading />;

  if (error) {
    return (
      <Screen>
        <EmptyState
          title="Could not load your account"
          body={error}
          action={<Button title="Try again" onPress={() => refreshProfile()} />}
        />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="account-restricted" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="auth/reset" />
      <Stack.Screen name="legal/[document]" options={{ presentation: "card" }} />
      <Stack.Screen name="commitment/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="commitment/[id]" options={{ presentation: "card" }} />
      <Stack.Screen
        name="proof/capture"
        options={{ presentation: "fullScreenModal" }}
      />
      <Stack.Screen name="circle/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="circle/join" options={{ presentation: "modal" }} />
      <Stack.Screen name="circle/[id]" options={{ presentation: "card" }} />
      <Stack.Screen
        name="circle/review/[submissionId]"
        options={{ presentation: "card" }}
      />
      <Stack.Screen name="wall/[userId]" options={{ presentation: "card" }} />
      <Stack.Screen name="profile/history" options={{ presentation: "card" }} />
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
      <Stack.Screen name="settings/index" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/report" options={{ presentation: "modal" }} />
      <Stack.Screen name="settings/blocked" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/support" options={{ presentation: "card" }} />
      <Stack.Screen
        name="settings/legal/[document]"
        options={{ presentation: "card" }}
      />
      <Stack.Screen
        name="redemption/[id]"
        options={{ presentation: "modal" }}
      />
    </Stack>
  );
}

export default function Root() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Guard />
    </AppProviders>
  );
}
