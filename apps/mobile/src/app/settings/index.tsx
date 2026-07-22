import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import {
  Button,
  Card,
  Header,
  Screen,
  SectionHeader,
  SettingsRow,
  Text,
} from "../../components/ui";
import { updatePrivacy } from "../../features/profile/api";
import { prepareAppleRevocationForDeletion } from "../../features/auth/social";
import { useSession } from "../../providers/session";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";

async function requestDeletion(continueWithoutAppleRevocation = false) {
  const result = await supabase.functions.invoke("request-account-deletion", {
    body: { continueWithoutAppleRevocation },
  });
  if (result.error) throw result.error;
  if (result.data?.error) throw new Error(result.data.error);
  return result.data as {
    scheduledFor?: string;
    requiresAppleReauth?: boolean;
    appleRevocationPrepared?: boolean;
    message?: string;
  };
}

function confirmDeletionWithoutAppleRevocation(message?: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      "Apple confirmation unavailable",
      `${message ?? "CalledOut could not confirm the linked Apple account."}\n\nYou can still permanently delete your CalledOut account. Apple authorization may need to be removed separately from your Apple ID settings.`,
      [
        {
          text: "Keep account",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Delete anyway",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false },
    );
  });
}

export default function Settings() {
  const { profile, refreshProfile, signOut } = useSession();
  const [publicProfile, setPublicProfile] = useState(
    profile?.public_profile_opt_in ?? false,
  );
  const [publicWall, setPublicWall] = useState(
    profile?.public_wall_opt_in ?? false,
  );
  const [deleting, setDeleting] = useState(false);

  const privacyMutation = useMutation({
    mutationFn: updatePrivacy,
    onSuccess: refreshProfile,
  });

  function savePrivacy(nextProfile: boolean, nextWall: boolean) {
    const previousProfile = publicProfile;
    const previousWall = publicWall;

    setPublicProfile(nextProfile);
    setPublicWall(nextWall);
    privacyMutation.mutate(
      {
        public_profile_opt_in: nextProfile,
        public_wall_opt_in: nextWall,
      },
      {
        onError: () => {
          setPublicProfile(previousProfile);
          setPublicWall(previousWall);
        },
      },
    );
  }

  async function completeDeletionRequest() {
    setDeleting(true);

    try {
      let result = await requestDeletion();

      if (result.requiresAppleReauth) {
        let appleConfirmed = false;
        let appleError: string | undefined;

        try {
          const confirmation = await prepareAppleRevocationForDeletion();
          appleConfirmed = !confirmation.cancelled;
        } catch (error) {
          appleError =
            error instanceof Error
              ? error.message
              : "Apple confirmation could not be completed.";
        }

        if (appleConfirmed) {
          result = await requestDeletion();
        } else {
          const proceed = await confirmDeletionWithoutAppleRevocation(
            appleError ?? result.message,
          );
          if (!proceed) return;
          result = await requestDeletion(true);
        }
      }

      if (!result.scheduledFor) {
        throw new Error(
          result.message ?? "CalledOut could not schedule account deletion.",
        );
      }

      Alert.alert(
        "Deletion requested",
        "Your profile is hidden and the account is scheduled for permanent deletion in 30 days. You will be signed out now.",
        [
          {
            text: "Sign out",
            onPress: () => {
              void signOut();
            },
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      Alert.alert(
        "Could not start deletion",
        error instanceof Error
          ? error.message
          : "CalledOut could not start account deletion.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function deletion() {
    Alert.alert(
      "Delete account?",
      "Your profile and social visibility will be removed and the account will enter a 30-day deletion process. If this account uses Sign in with Apple, Apple may ask you to confirm the linked account so CalledOut can revoke its authorization. You can still continue deletion if Apple confirmation is unavailable. Deleting CalledOut does not cancel an App Store subscription, so cancel it from Subscription & plan first. Limited billing, security, fraud-prevention, audit, or legal records may be retained when required.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            void completeDeletionRequest();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Header
        title="Settings & privacy"
        subtitle="CalledOut stays private unless you explicitly opt in."
        backLabel="Profile"
        onBack={router.back}
      />

      <SectionHeader title="Privacy" />
      <Card>
        <SettingsRow
          title="Public profile"
          body="Allow people outside your circles to view your basic profile."
          value={publicProfile}
          disabled={privacyMutation.isPending}
          onValueChange={(next) => savePrivacy(next, publicWall)}
        />
        <SettingsRow
          title="Public Wall visibility"
          body="Allow eligible misses to appear beyond private circles."
          value={publicWall}
          disabled={privacyMutation.isPending}
          onValueChange={(next) => savePrivacy(publicProfile, next)}
        />
        {privacyMutation.isPending ? (
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Saving privacy settings…
          </Text>
        ) : null}
        {privacyMutation.error ? (
          <Text variant="caption" style={{ color: colors.missed }}>
            {privacyMutation.error.message}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Safety & support" />
      <Button
        title="Blocked accounts"
        variant="secondary"
        onPress={() => router.push("/settings/blocked" as never)}
      />
      <Button
        title="Contact support"
        variant="secondary"
        onPress={() => router.push("/settings/support" as never)}
      />
      <Button
        title="Community Guidelines"
        variant="secondary"
        onPress={() => router.push("/settings/legal/community" as never)}
      />

      <SectionHeader title="Legal" />
      <Button
        title="Privacy Policy"
        variant="secondary"
        onPress={() => router.push("/settings/legal/privacy" as never)}
      />
      <Button
        title="Terms of Use"
        variant="secondary"
        onPress={() => router.push("/settings/legal/terms" as never)}
      />

      <SectionHeader title="Account" />
      <Button
        title="Subscription & plan"
        variant="secondary"
        onPress={() => router.push("/profile/subscription" as never)}
      />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button
        title="Delete account"
        variant="danger"
        loading={deleting}
        disabled={deleting}
        onPress={deletion}
      />
    </Screen>
  );
}
