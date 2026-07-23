import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
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

const gold = "#B7791F";
const goldBright = "#D6A12A";
const goldSoft = "#F8E7B7";
const goldWash = "#FCF7EA";

const features = [
  {
    icon: "people" as const,
    title: "More accountability circles",
    body: "Up to 5 circles to keep family, friends, and training partners separate.",
  },
  {
    icon: "calendar" as const,
    title: "More workout schedules",
    body: "Run different plans for gym days, runs, sports, and recovery.",
  },
  {
    icon: "shield-checkmark" as const,
    title: "Extra grace passes",
    body: "2 passes each month for the real-life interruptions you cannot control.",
  },
  {
    icon: "analytics" as const,
    title: "Deeper accountability insights",
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
      ? `${monthly}/month · ${pkg.product.priceString} billed annually`
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
  const selectedAnnual = selected?.packageType === PACKAGE_TYPE.ANNUAL;

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

  if (alreadyPro) {
    return (
      <Screen>
        <Header
          eyebrow="CALLEDOUT PRO"
          title="Your plan is active."
          subtitle="Your Pro limits and benefits are unlocked."
          backLabel="Profile"
          onBack={router.back}
        />

        {planQuery.data ? (
          <Card style={{ gap: spacing.md }}>
            <View style={styles.activePlanHeader}>
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
            <View key={feature.title} style={styles.compactFeatureRow}>
              <View style={styles.compactFeatureIcon}>
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

        {message ? (
          <View style={[styles.messageCard, { borderColor: messageColor }]}>
            <Ionicons
              name={
                messageTone === "success"
                  ? "checkmark-circle"
                  : messageTone === "error"
                    ? "alert-circle"
                    : "information-circle"
              }
              size={20}
              color={messageColor}
            />
            <Text variant="caption" style={{ color: messageColor, flex: 1 }}>
              {message}
            </Text>
          </View>
        ) : null}

        <Button
          title="Restore purchases"
          variant="secondary"
          loading={purchasing}
          onPress={restore}
        />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Profile"
        onPress={() => router.back()}
        hitSlop={8}
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text variant="caption">Profile</Text>
      </Pressable>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <View style={styles.proBadge}>
            <Text style={styles.crownGlyph}>♛</Text>
            <Text variant="label" style={{ color: colors.text }}>
              CALLEDOUT PRO
            </Text>
          </View>
          <Text variant="display" style={styles.heroTitle}>
            Level up your accountability.
          </Text>
          <Text variant="label" style={styles.heroEyebrow}>
            STRONGER FOLLOW-THROUGH. FEWER EXCUSES. REAL RESULTS.
          </Text>
        </View>

        <View style={styles.crownTile}>
          <View style={styles.crownGlow} />
          <Text style={styles.heroCrown}>♛</Text>
        </View>
      </View>

      <View style={styles.featurePanel}>
        {features.map((feature, index) => (
          <View key={feature.title}>
            <View style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={colors.text} />
              </View>
              <View style={styles.featureCopy}>
                <Text variant="bodyStrong" style={styles.featureTitle}>
                  {feature.title}
                </Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {feature.body}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={goldBright}
              />
            </View>
            {index < features.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>

      <View style={styles.sectionLabelRow}>
        <View style={styles.sectionLine} />
        <Text variant="label" style={{ color: gold }}>
          CHOOSE YOUR PLAN
        </Text>
        <View style={styles.sectionLine} />
      </View>

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
                style={({ pressed }) => [
                  styles.planPressable,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.planCard,
                    annual ? styles.annualPlan : styles.monthlyPlan,
                    !annual && chosen ? styles.monthlyPlanChosen : null,
                  ]}
                >
                  <View style={styles.planHeader}>
                    <View style={{ flex: 1, gap: spacing.xxs }}>
                      {annual ? (
                        <View style={styles.bestValuePill}>
                          <Text variant="label" style={{ color: colors.dark }}>
                            BEST VALUE
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        variant="section"
                        style={{ color: annual ? colors.surface : colors.text }}
                      >
                        {packageLabel(pkg)}
                      </Text>
                      <Text
                        style={{
                          color: annual ? goldSoft : colors.textSecondary,
                        }}
                      >
                        {planPriceCopy(pkg)}
                      </Text>
                    </View>

                    <View style={styles.planChoiceArea}>
                      {annual && savings ? (
                        <View style={styles.savingsPill}>
                          <Text variant="label" style={{ color: goldSoft }}>
                            SAVE {savings}%
                          </Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name={chosen ? "radio-button-on" : "radio-button-off"}
                        size={30}
                        color={annual ? goldSoft : colors.textSecondary}
                      />
                    </View>
                  </View>

                  {annual ? (
                    <View style={styles.annualBenefits}>
                      <View style={styles.annualBenefit}>
                        <Ionicons name="trophy-outline" size={18} color={goldSoft} />
                        <Text variant="caption" style={{ color: colors.surface }}>
                          Best monthly price
                        </Text>
                      </View>
                      <View style={styles.benefitDivider} />
                      <View style={styles.annualBenefit}>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={goldSoft}
                        />
                        <Text variant="caption" style={{ color: colors.surface }}>
                          One annual renewal
                        </Text>
                      </View>
                      <View style={styles.benefitDivider} />
                      <View style={styles.annualBenefit}>
                        <Ionicons name="lock-closed" size={18} color={goldSoft} />
                        <Text variant="caption" style={{ color: colors.surface }}>
                          Cancel anytime
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {intro ? (
                    <Text
                      variant="caption"
                      style={{ color: annual ? goldSoft : colors.verified }}
                    >
                      {intro}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          {selectedAnnual ? (
            <View style={styles.socialProof}>
              <Ionicons name="star" size={16} color={goldBright} />
              <Text variant="caption" style={{ color: gold }}>
                Most members choose annual.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              selected
                ? `Continue with ${packageLabel(selected)}`
                : "Continue"
            }
            disabled={!selected || purchasing}
            onPress={buy}
            style={({ pressed }) => [
              styles.primaryCta,
              pressed && styles.pressed,
              (!selected || purchasing) && styles.disabled,
            ]}
          >
            {purchasing ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <>
                <Text style={styles.ctaCrown}>♛</Text>
                <Text variant="section" style={{ color: colors.surface }}>
                  {selected
                    ? `Continue with ${packageLabel(selected)}`
                    : "Continue"}
                </Text>
              </>
            )}
          </Pressable>

          <View style={styles.cancelRow}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Cancel anytime in your App Store account.
            </Text>
          </View>
        </View>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="bodyStrong">Plans are temporarily unavailable</Text>
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

      {message ? (
        <View style={[styles.messageCard, { borderColor: messageColor }]}>
          <Ionicons
            name={
              messageTone === "success"
                ? "checkmark-circle"
                : messageTone === "error"
                  ? "alert-circle"
                  : "information-circle"
            }
            size={20}
            color={messageColor}
          />
          <Text variant="caption" style={{ color: messageColor, flex: 1 }}>
            {message}
          </Text>
        </View>
      ) : null}

      {purchaseConfirmed ? (
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

      <Text variant="caption" style={styles.legalCopy}>
        Payment is charged to your app store account. Subscriptions renew
        automatically unless canceled in your account settings. Proof submission,
        existing records, and account access remain available if Pro ends.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: 32,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  proBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  crownGlyph: {
    color: gold,
    fontSize: 20,
    lineHeight: 22,
  },
  heroTitle: {
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -1.4,
  },
  heroEyebrow: {
    color: colors.textSecondary,
    lineHeight: 19,
  },
  crownTile: {
    width: 102,
    height: 118,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#EEE1C4",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: gold,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
    overflow: "hidden",
  },
  crownGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: goldWash,
    opacity: 0.9,
  },
  heroCrown: {
    color: goldBright,
    fontSize: 58,
    lineHeight: 64,
    textShadowColor: "rgba(183,121,31,0.25)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  featurePanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: goldWash,
    alignItems: "center",
    justifyContent: "center",
  },
  featureCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  featureTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    marginLeft: 78,
    backgroundColor: colors.border,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E8D7B1",
  },
  planPressable: {
    borderRadius: radius.xl,
  },
  planCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  annualPlan: {
    backgroundColor: colors.dark,
    borderWidth: 2,
    borderColor: goldBright,
    shadowColor: gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  monthlyPlan: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthlyPlanChosen: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  planChoiceArea: {
    alignItems: "flex-end",
    gap: spacing.md,
  },
  bestValuePill: {
    alignSelf: "flex-start",
    backgroundColor: goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  savingsPill: {
    borderWidth: 1,
    borderColor: goldBright,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  annualBenefits: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  annualBenefit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  benefitDivider: {
    width: 1,
    backgroundColor: "rgba(248,231,183,0.22)",
  },
  socialProof: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: goldWash,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  primaryCta: {
    minHeight: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.dark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  ctaCrown: {
    color: goldSoft,
    fontSize: 28,
    lineHeight: 32,
  },
  cancelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  messageCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  legalCopy: {
    color: colors.textSecondary,
    textAlign: "center",
  },
  activePlanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  compactFeatureRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  compactFeatureIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
});