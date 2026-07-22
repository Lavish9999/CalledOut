import React, { useEffect } from "react";
import { View } from "react-native";
import { usePathname } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LegalLinks } from "../components/legal-links";
import { queryClient } from "../lib/query";
import { colors, spacing } from "../theme/tokens";
import { SessionProvider } from "./session";
import { ConnectivityProvider } from "./connectivity";
import { installGlobalErrorHandler } from "../lib/observability";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showPaywallLegalFooter = pathname === "/paywall";

  useEffect(() => installGlobalErrorHandler(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ConnectivityProvider>
              <View style={{ flex: 1 }}>
                <View style={{ flex: 1 }}>{children}</View>
                {showPaywallLegalFooter ? (
                  <View
                    style={{
                      backgroundColor: colors.background,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      paddingHorizontal: spacing.lg,
                      paddingTop: spacing.sm,
                      paddingBottom: spacing.md,
                    }}
                  >
                    <LegalLinks intro="Subscription policies:" />
                  </View>
                ) : null}
              </View>
            </ConnectivityProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
