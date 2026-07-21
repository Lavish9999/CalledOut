import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { PurchasesPackage } from "react-native-purchases";
import { Button, Card, Header, Loading, Screen, Text } from "../components/ui";
import {
  getPackages,
  purchasePackage,
  restorePurchases,
} from "../lib/purchases";
import { analytics } from "../lib/analytics";
import { colors } from "../theme/tokens";
export default function Paywall() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    analytics.capture("paywall_viewed");
    getPackages()
      .then(setPackages)
      .finally(() => setLoading(false));
  }, []);
  async function buy(p: PurchasesPackage) {
    setLoading(true);
    try {
      const pro = await purchasePackage(p);
      if (pro) {
        analytics.capture("subscription_started", { package: p.identifier });
        router.back();
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Purchase could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <Screen>
      <Header
        title="Make excuses harder."
        subtitle="Proof submission always remains available, even if Pro expires."
      />
      <Card>
        <Text>• Join more accountability circles</Text>
        <Text>• Unlock advanced proof verification</Text>
        <Text>• Create custom consequences</Text>
        <Text>• See your full record</Text>
        <Text>• Build private challenges</Text>
      </Card>
      {loading ? (
        <Loading />
      ) : (
        packages.map((p) => (
          <Button
            key={p.identifier}
            title={`${p.product.title} · ${p.product.priceString}`}
            variant={p.packageType === "ANNUAL" ? "primary" : "secondary"}
            onPress={() => buy(p)}
          />
        ))
      )}
      {!packages.length && !loading ? (
        <Text style={{ color: colors.textSecondary }}>
          Store products are unavailable in this build. Verify RevenueCat keys
          and the default offering.
        </Text>
      ) : null}
      {message ? <Text style={{ color: colors.missed }}>{message}</Text> : null}
      <Button
        title="Restore purchases"
        variant="ghost"
        onPress={async () => {
          setLoading(true);
          const pro = await restorePurchases();
          setMessage(
            pro
              ? "Purchases restored."
              : "No active CalledOut Pro entitlement was found.",
          );
          setLoading(false);
        }}
      />
      <Button title="Not now" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
