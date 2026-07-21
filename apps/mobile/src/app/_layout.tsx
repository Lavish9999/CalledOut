import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "../providers/app-providers";
import { useSession } from "../providers/session";
import { Loading } from "../components/ui";

function Guard() {
  const { session, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const group = segments[0];

    if (!session && group !== "(auth)") {
      router.replace("/(auth)");
    } else if (
      session &&
      !profile?.onboarding_completed_at &&
      group !== "(onboarding)"
    ) {
      router.replace("/(onboarding)");
    } else if (
      session &&
      profile?.onboarding_completed_at &&
      (group === "(auth)" || group === "(onboarding)")
    ) {
      router.replace("/(tabs)");
    }
  }, [session, profile, loading, segments, router]);

  if (loading) return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="auth/reset" />
      <Stack.Screen name="commitment/new" options={{ presentation: "modal" }} />
      <Stack.Screen
        name="proof/capture"
        options={{ presentation: "fullScreenModal" }}
      />
      <Stack.Screen name="circle/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="circle/join" options={{ presentation: "modal" }} />
      <Stack.Screen name="circle/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="wall/[userId]" options={{ presentation: "card" }} />
      <Stack.Screen name="profile/history" options={{ presentation: "card" }} />
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
      <Stack.Screen name="settings/index" options={{ presentation: "card" }} />
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
