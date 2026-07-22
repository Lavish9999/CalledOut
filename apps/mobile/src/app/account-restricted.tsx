import { useState } from "react";
import { Alert, Linking } from "react-native";
import { router } from "expo-router";

import { Button, Card, Header, Screen, Text } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useSession } from "../providers/session";
import { colors, spacing } from "../theme/tokens";

const SUPPORT_EMAIL = "robbieyisa2@icloud.com";

function copyForStatus(status?: string) {
  if (status === "deletion_pending") {
    return {
      eyebrow: "DELETION PENDING",
      title: "This account is scheduled for deletion.",
      body: "Your public visibility and notifications are disabled during the 30-day deletion period. Deleting CalledOut does not cancel an App Store subscription.",
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
  const { profile, refreshProfile, signOut } = useSession();
  const [restoring, setRestoring] = useState(false);
  const copy = copyForStatus(profile?.account_status);

  async function contactSupport() {
    const subject = encodeURIComponent(
      `CalledOut account review · ${profile?.username ?? "account"}`,
    );
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  }

  async function cancelDeletion() {
    setRestoring(true);

    try {
      const { error } = await supabase.rpc("cancel_account_deletion");
      if (error) throw error;
      await refreshProfile();
      Alert.alert(
        "Deletion cancelled",
        "Your CalledOut account is active again. Public profile and public Wall visibility remain off until you choose to enable them.",
      );
    } catch (error) {
      Alert.alert(
        "Could not cancel deletion",
        error instanceof Error
          ? error.message
          : "CalledOut could not restore this account.",
      );
    } finally {
      setRestoring(false);
    }
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

      {profile?.account_status === "deletion_pending" ? (
        <Button
          title="Cancel account deletion"
          loading={restoring}
          disabled={restoring}
          onPress={() =>
            Alert.alert(
              "Keep this account?",
              "The scheduled deletion will be cancelled and your CalledOut account will become active again.",
              [
                { text: "Not now", style: "cancel" },
                {
                  text: "Keep account",
                  onPress: () => {
                    void cancelDeletion();
                  },
                },
              ],
            )
          }
        />
      ) : null}

      <Button title="Contact support" onPress={contactSupport} />
      <Button
        title="Read Community Guidelines"
        variant="secondary"
        onPress={() => router.push("/legal/community" as never)}
      />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
