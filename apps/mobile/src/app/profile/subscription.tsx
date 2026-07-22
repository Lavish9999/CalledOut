import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Metric,
  Screen,
  SectionHeader,
  StatusPill,
  Text,
} from "../../components/ui";
import {
  getPlanOverview,
  reconcilePlanAccess,
} from "../../features/subscription/api";
import {
  openSubscriptionManagement,
  restorePurchases,
} from "../../lib/purchases";
import { captureException } from "../../lib/observability";
import { queryClient, qk } from "../../lib/query";
import { dateLabel } from "../../lib/date";
import {
  subscriptionPeriodVerb,
  subscriptionPlanName,
  subscriptionStatusLabel,
} from "../../lib/subscription-display";
import { colors, spacing } from "../../theme/tokens";

export default function SubscriptionScreen() {
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function syncAccess(expectPro = false) {
    setWorking(true);
    setMessage("");
    setError(false);

    try {
      const plan = await reconcilePlanAccess({
        expectPro,
        attempts: expectPro ? 4 : 2,
        delayMs: 800,
      });
      queryClient.setQueryData(qk.plan, plan);
      setMessage(
        plan.isPro
          ? "Your CalledOut Pro access is up to date."
          : "No active CalledOut Pro subscription was found.",
      );
    } catch (cause) {
      captureException(cause, { area: "subscription_screen_sync" });
      setError(true);
      setMessage("Your subscription could not be checked right now.");
    } finally {
      setWorking(false);
    }
  }

  async function restore() {
    setWorking(true);
    setMessage("");
    setError(false);

    try {
      const result = await restorePurchases();
      if (!result.isPro) {
        setMessage(
          "No active CalledOut Pro purchase was found for this account.",
        );
        return;
      }
      await syncAccess(true);
    } catch (cause) {
      captureException(cause, { area: "subscription_screen_restore" });
      setError(true);
      setMessage("Purchases could not be restored right now.");
      setWorking(false);
    }
  }

  if (planQuery.isLoading) {
    return (
      <Screen>
        <Header
          title="CalledOut Pro"
          backLabel="Profile"
          onBack={router.back}
        />
        <Loading />
      </Screen>
    );
  }

  if (planQuery.error) {
    return (
      <Screen>
        <Header
          title="CalledOut Pro"
          backLabel="Profile"
          onBack={router.back}
        />
        <EmptyState
          title="Could not load your plan"
          body="Check your connection and try again."
          action={
            <Button title="Try again" onPress={() => planQuery.refetch()} />
          }
        />
      </Screen>
    );
  }

  const plan = planQuery.data;

  return (
    <Screen>
      <Header
        eyebrow="SUBSCRIPTION"
        title={
          plan?.isPro ? subscriptionPlanName(plan.productId) : "CalledOut Pro"
        }
        subtitle={
          plan?.isPro
            ? "Your accountability system is fully unlocked."
            : "Unlock more schedules, circles, grace passes, and insights."
        }
        backLabel="Profile"
        onBack={router.back}
      />

      {plan?.isPro ? (
        <>
          <Card style={{ gap: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text variant="section">CalledOut Pro</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {subscriptionPlanName(plan.productId)}
                </Text>
              </View>
              <StatusPill
                status={subscriptionStatusLabel(plan.subscriptionStatus)}
              />
            </View>

            {plan.currentPeriodEndsAt ? (
              <Text style={{ color: colors.textSecondary }}>
                {subscriptionPeriodVerb(plan)}{" "}
                {dateLabel(plan.currentPeriodEndsAt)}
              </Text>
            ) : null}

            {plan.isSandbox ? (
              <Text variant="caption" style={{ color: colors.warning }}>
                Sandbox subscription · no real charge
              </Text>
            ) : null}
          </Card>

          <SectionHeader title="Your Pro limits" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Metric
              compact
              value={`${plan.activeScheduleCount}/${plan.scheduleLimit}`}
              label="schedules"
            />
            <Metric
              compact
              value={`${plan.activeCircleCount}/${plan.circleLimit}`}
              label="circles"
            />
          </View>
          <Metric
            value={plan.gracePassesRemaining}
            label={`grace pass${
              plan.gracePassesRemaining === 1 ? "" : "es"
            } available this month`}
          />
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Free includes one monthly pass. Pro adds a second.
          </Text>

          <Button
            title="Manage in App Store"
            onPress={() => openSubscriptionManagement()}
          />
          <Button
            title="Sync subscription status"
            variant="secondary"
            loading={working}
            onPress={() => syncAccess(true)}
          />
        </>
      ) : (
        <Card style={{ gap: spacing.md }}>
          <Text variant="section">You are on the Free plan</Text>
          <Text style={{ color: colors.textSecondary }}>
            The core proof and accountability loop remains available.
          </Text>
          <Button
            title="See CalledOut Pro"
            onPress={() =>
              router.replace("/paywall?source=subscription" as never)
            }
          />
        </Card>
      )}

      <Button
        title="Restore purchases"
        variant="secondary"
        loading={working}
        onPress={restore}
      />

      {message ? (
        <Text style={{ color: error ? colors.missed : colors.verified }}>
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}
