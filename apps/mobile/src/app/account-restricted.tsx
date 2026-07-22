import { Linking } from "react-native";
import { router } from "expo-router";

import { Button, Card, Header, Screen, Text } from "../components/ui";
import { useSession } from "../providers/session";
import { colors, spacing } from "../theme/tokens";

const SUPPORT_EMAIL = "robbieyisa2@icloud.com";

function copyForStatus(status?: string) {
  if (status === "deletion_pending") {
    return {
      eyebrow: "DELETION PENDING",
      title: "This account is being removed.",
      body: "Your public visibility and notifications are disabled while the deletion request is processed. Deleting CalledOut does not cancel an App Store subscription.",
    };
  }

  if (status === "banned") {
    return {
      eyebrow: "ACCOUNT BANNED",
      title: "This account cannot use CalledOut.",
      body: "Access was removed after a safety or integrity review. Contact support if you believe this decision was made in error.",
    };
  }

  return {
    eyebrow: "ACCOUNT SUSPENDED",
    title: "CalledOut access is temporarily restricted.",
    body: "Commitments, proof, circles, and social actions are disabled while this account is under review.",
  };
}

export default function AccountRestricted() {
  const { profile, signOut } = useSession();
  const copy = copyForStatus(profile?.account_status);

  async function contactSupport() {
    const subject = encodeURIComponent(
      `CalledOut account review · ${profile?.username ?? "account"}`,
    );
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  }

  return (
    <Screen>
      <Header eyebrow={copy.eyebrow} title={copy.title} />

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textSecondary }}>{copy.body}</Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          Account: @{profile?.username ?? "unknown"}
        </Text>
      </Card>

      <Button title="Contact support" onPress={contactSupport} />
      <Button
        title="Read Community Guidelines"
        variant="secondary"
        onPress={() => router.push("/legal/community-guidelines" as never)}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
