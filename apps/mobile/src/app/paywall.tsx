import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";
import { Ionicons } from "@expo/vector-icons";

import {
  Button,
  Card,
  Header,
  Loading,
  Screen,
  SectionHeader,
  StatusPill,
  Text,
} from "../components/ui";
import {
  getPlanOverview,
  reconcilePlanAccess,
} from "../features/subscription/api";
import {
  getPackages,
  isPurchaseCancelled,
  openSubscriptionManagement,
  purchasePackage,
  purchasesConfigured,
  restorePurchases,
} from "../lib/purchases";
import { analytics } from "../lib/analytics";
import { captureException } from "../lib/observability";
import { queryClient, qk } from "../lib/query";
import { dateLabel } from "../lib/date";
import {
  subscriptionPeriodVerb,
  subscriptionPlanName,
  subscriptionStatusLabel,
} from "../lib/subscription-display";
import { colors, radius, spacing } from "../theme/tokens";

const features = [
  {
    icon: "repeat" as const,
    title: "Up to 5 workout schedules",
    body: "Run different plans for gym days, runs, sports, and recovery.",
  },
  {
    icon: "people" as const,
    title: "Up to 5 accountability circles",
    body: "Keep family, friends, and training partners separate.",
  },
  {
    icon: "shield-checkmark" as const,
    title: "2 grace passes each month",
    body: "Free includes one. Pro adds one more for real-life interruptions.",
  },
  {
    icon: "analytics" as const,
    title: "Accountability insights",
    body: "See your strongest weekday, workout type, and 30-day completion rate.",
  },
  {
    icon: "options" as const,
    title: "Custom proof windows",
    body: "Choose when proof opens instead of using the standard four-hour window.",
  },
];

type MessageTone = "success" | "error" | "info";

function packageLabel(pkg: PurchasesPackage) {
  if (pkg.packageType === PACKAGE_TYPE.ANNUAL) return "Annual";
  if (pkg.packageType === PACKAGE_TYPE.MONTHLY) return "Monthly";
  return pkg.product.title;
}

function annualSavings(packages: PurchasesPackage[]) {
  const monthly = packages.find(
    (pkg) => pkg.packageType === PACKAGE_TYPE.MONTHLY,
  );
  const annual = packages.find(
    (pkg) => pkg.packageType === PACKAGE_TYPE.ANNUAL,
  );

  if (!monthly || !annual || monthly.product.price <= 0) return null;
  const yearlyMonthlyPrice = monthly.product.price * 12;
  const percentage = Math.round(
    ((yearlyMonthlyPrice - annual.product.price) / yearlyMonthlyPrice) * 100,
  );

  return percentage > 0 ? percentage : null;
}

function introCopy(pkg: PurchasesPackage) {
  const intro = pkg.product.introPrice;
  if (!intro) return null;

  const duration = `${intro.periodNumberOfUnits} ${intro.periodUnit.toLowerCase()}${
    intro.periodNumberOfUnits === 1 ? "" : "s"
  }`;

  if (intro.price === 0) {
    return `${duration} free, then ${pkg.product.priceString}`;
  }

  return `${intro.priceString} for ${duration}, then ${pkg.product.priceString}`;
}

function planPriceCopy(pkg: PurchasesPackage) {
  if (pkg.packageType === PACKAGE_TYPE.ANNUAL) {
    const monthly = pkg.product.pricePerMonthString;
    return monthly
      ? `${monthly}/month · ${pkg.product.priceString}/year`
      : `${pkg.product.priceString}/year`;
  }

  if (pkg.packageType === PACKAGE_TYPE.MONTHLY) {
    return `${pkg.product.priceString}/month`;
  }

  return pkg.product.priceString;
}

export default function Paywall() {
  const { source = "profile" } = useLocalSearchParams<{ source?: string }>();
  const planQuery = useQuery({ queryKey: qk.plan, queryFn: getPlanOverview });
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingStore, setLoadingStore] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);

  useEffect(() => {
    analytics.capture("paywall_viewed", { source });
    getPackages()
      .then((available) => {
        const sorted = [...available].sort((left, right) => {
          if (left.packageType === PACKAGE_TYPE.ANNUAL) return -1;
          if (right.packageType === PACKAGE_TYPE.ANNUAL) return 1;
          return 0;
        });
        setPackages(sorted);
        setSelectedId(sorted[0]?.identifier ?? null);
      })
      .catch((error) => {
        captureException(error, { area: "paywall_offerings" });
        setMessageTone("error");
        setMessage(
          "Plans could not be loaded. Check your connection and try again.",
        );
      })
      .finally(() => setLoadingStore(false));
  }, [source]);

  const selected = useMemo(
    () => packages.find((pkg) => pkg.identifier === selectedId) ?? packages[0],
    [packages, selectedId],
  );
  const savings = annualSavings(packages);
  const alreadyPro = planQuery.data?.isPro === true;

  async function syncConfirmedPurchase() {
    const plan = await reconcilePlanAccess({
      expectPro: true,
      attempts: 4,
      delayMs: 900,
    });
    queryClient.setQueryData(qk.plan, plan);
    await queryClient.invalidateQueries({ queryKey: qk.plan });
    return plan;
  }

  async function buy() {
    if (!selected) return;

    setPurchasing(true);
    setMessage("");
    setPurchaseConfirmed(false);
    analytics.capture("subscription_purchase_started", {
      source,
      package: selected.identifier,
      product: selected.product.identifier,
    });

    try {
      const result = await purchasePackage(selected);
      if (!result.isPro) {
        setMessageTone("error");
        setMessage(
          "The App Store completed the purchase, but it did not return active Pro access. Restore purchases or contact support.",
        );
        return;
      }

      setPurchaseConfirmed(true);
      setMessageTone("info");
      setMessage("Purchase confirmed. Unlocking Pro…");
      await syncConfirmedPurchase();

      analytics.capture("subscription_started", {
        source,
        package: selected.identifier,
        product: selected.product.identifier,
      });
      setMessageTone("success");
      setMessage("CalledOut Pro is active.");
      router.back();
    } catch (error) {
      if (isPurchaseCancelled(error)) {
        analytics.capture("subscription_purchase_cancelled", { source });
        return;
      }

      captureException(error, { area: "subscription_purchase" });
      analytics.capture("subscription_purchase_failed", { source });
      setMessageTone(purchaseConfirmed ? "info" : "error");
      setMessage(
        purchaseConfirmed
          ? "Your purchase is confirmed, but access is still syncing. Tap Sync Pro access below."
          : "The purchase could not be completed. Check your connection and try again.",
      );
    } finally {
      setPurchasing(false);
    }
  }

  async function restore() {
    setPurchasing(true);
    setMessage("");
    analytics.capture("subscription_restore_started", { source });

    try {
      const result = await restorePurchases();
      if (!result.isPro) {
        setMessageTone("info");
        setMessage(
          "No active CalledOut Pro purchase was found for this App Store account.",
        );
        return;
      }

      setPurchaseConfirmed(true);
      const plan = await syncConfirmedPurchase();
      setMessageTone("success");
      setMessage(
        plan.isPro
          ? "CalledOut Pro was restored and unlocked."
          : "The purchase was restored, but access is still syncing.",
      );
    } catch (error) {
      captureException(error, { area: "subscription_restore" });
      setMessageTone(purchaseConfirmed ? "info" : "error");
      setMessage(
        purchaseConfirmed
          ? "The purchase was restored, but access is still syncing. Tap Sync Pro access."
          : "Purchases could not be restored. Check your connection and try again.",
      );
    } finally {
      setPurchasing(false);
    }
  }

  async function syncAccess() {
    setPurchasing(true);
    setMessageTone("info");
    setMessage("Checking your CalledOut Pro access…");

    try {
      const plan = await syncConfirmedPurchase();
      setMessageTone(plan.isPro ? "success" : "info");
      setMessage(
        plan.isPro
          ? "CalledOut Pro is active."
          : "No active CalledOut Pro entitlement was found.",
      );
    } catch (error) {
      captureException(error, { area: "subscription_manual_sync" });
      setMessageTone("error");
      setMessage(
        "Pro access could not be checked right now. Try again shortly.",
      );
    } finally {
      setPurchasing(false);
    }
  }

  const messageColor =
    messageTone === "success"
      ? colors.verified
      : messageTone === "error"
        ? colors.missed
        : colors.textSecondary;

  return (
    <Screen>
      <Header
        eyebrow="CALLEDOUT PRO"
        title={
          alreadyPro
            ? "Your plan is active."
            : "Build a system you cannot ignore."
        }
        subtitle={
          alreadyPro
            ? "Your Pro limits and benefits are unlocked."
            : "The core accountability loop stays free. Pro expands the system around it."
        }
        backLabel="Profile"
        onBack={router.back}
      />

      {alreadyPro && planQuery.data ? (
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
              <Text variant="section">
                {subscriptionPlanName(planQuery.data.productId)}
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                CalledOut Pro
              </Text>
            </View>
            <StatusPill
              status={subscriptionStatusLabel(
                planQuery.data.subscriptionStatus,
              )}
            />
          </View>

          {planQuery.data.currentPeriodEndsAt ? (
            <Text style={{ color: colors.textSecondary }}>
              {subscriptionPeriodVerb(planQuery.data)}{" "}
              {dateLabel(planQuery.data.currentPeriodEndsAt)}
            </Text>
          ) : (
            <Text style={{ color: colors.textSecondary }}>
              Your subscription is active and managed by your app store account.
            </Text>
          )}

          {planQuery.data.isSandbox ? (
            <Text variant="caption" style={{ color: colors.warning }}>
              Sandbox subscription · no real charge
            </Text>
          ) : null}

          <Button
            title="Manage subscription"
            variant="secondary"
            onPress={() => openSubscriptionManagement()}
          />
        </Card>
      ) : null}

      <SectionHeader title="What Pro unlocks" />
      <Card style={{ gap: spacing.lg }}>
        {features.map((feature) => (
          <View
            key={feature.title}
            style={{ flexDirection: "row", gap: spacing.md }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={feature.icon} size={19} color={colors.text} />
            </View>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="bodyStrong">{feature.title}</Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {feature.body}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {!alreadyPro ? (
        <>
          <SectionHeader title="Choose your plan" />
          {loadingStore || planQuery.isLoading ? (
            <Loading />
          ) : packages.length ? (
            <View style={{ gap: spacing.sm }}>
              {packages.map((pkg) => {
                const chosen = pkg.identifier === selected?.identifier;
                const annual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
                const intro = introCopy(pkg);

                return (
                  <Pressable
                    key={pkg.identifier}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => setSelectedId(pkg.identifier)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  >
                    <Card
                      style={{
                        borderColor: chosen ? colors.text : colors.border,
                        borderWidth: chosen ? 2 : 1,
                        gap: spacing.sm,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: spacing.md,
                        }}
                      >
                        <View style={{ flex: 1, gap: spacing.xxs }}>
                          <Text variant="section">{packageLabel(pkg)}</Text>
                          <Text style={{ color: colors.textSecondary }}>
                            {planPriceCopy(pkg)}
                          </Text>
                        </View>
                        {annual && savings ? (
                          <StatusPill status={`save ${savings}%`} />
                        ) : (
                          <Ionicons
                            name={
                              chosen ? "radio-button-on" : "radio-button-off"
                            }
                            size={24}
                            color={colors.text}
                          />
                        )}
                      </View>
                      {intro ? (
                        <Text
                          variant="caption"
                          style={{ color: colors.verified }}
                        >
                          {intro}
                        </Text>
                      ) : null}
                    </Card>
                  </Pressable>
                );
              })}

              <Button
                title={
                  selected
                    ? `Continue with ${packageLabel(selected)}`
                    : "Continue"
                }
                loading={purchasing}
                disabled={!selected}
                onPress={buy}
              />
              <Text
                variant="caption"
                style={{ color: colors.textSecondary, textAlign: "center" }}
              >
                Cancel anytime in your App Store account.
              </Text>
            </View>
          ) : (
            <Card style={{ gap: spacing.sm }}>
              <Text variant="bodyStrong">
                Plans are temporarily unavailable
              </Text>
              <Text style={{ color: colors.textSecondary }}>
                The free app remains fully usable. Try again after checking your
                connection.
              </Text>
              {!purchasesConfigured() ? (
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  Store configuration is still being completed for this build.
                </Text>
              ) : null}
            </Card>
          )}
        </>
      ) : null}

      {message ? <Text style={{ color: messageColor }}>{message}</Text> : null}

      {purchaseConfirmed && !alreadyPro ? (
        <Button
          title="Sync Pro access"
          loading={purchasing}
          onPress={syncAccess}
        />
      ) : null}

      <Button
        title="Restore purchases"
        variant="secondary"
        loading={purchasing}
        onPress={restore}
      />

      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Payment is charged to your app store account. Subscriptions renew
        automatically unless canceled in your account settings. Proof
        submission, existing records, and account access remain available if Pro
        ends.
      </Text>
    </Screen>
  );
}
