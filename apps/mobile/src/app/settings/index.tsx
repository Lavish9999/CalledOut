import { useState } from "react";
import { Alert, Linking } from "react-native";
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
import { useSession } from "../../providers/session";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";

export default function Settings() {
  const { profile, refreshProfile, signOut } = useSession();
  const [publicProfile, setPublicProfile] = useState(
    profile?.public_profile_opt_in ?? false,
  );
  const [publicWall, setPublicWall] = useState(
    profile?.public_wall_opt_in ?? false,
  );

  const privacyMutation = useMutation({
    mutationFn: updatePrivacy,
    onSuccess: refreshProfile,
  });

  function savePrivacy(nextProfile: boolean, nextWall: boolean) {
    setPublicProfile(nextProfile);
    setPublicWall(nextWall);
    privacyMutation.mutate({
      public_profile_opt_in: nextProfile,
      public_wall_opt_in: nextWall,
    });
  }

  async function deletion() {
    Alert.alert(
      "Delete account?",
      "This starts deletion, signs you out, and removes social visibility. Legal, fraud-prevention, and financial records may be retained only for the disclosed period.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            const result = await supabase.functions.invoke(
              "request-account-deletion",
            );

            if (result.error) {
              Alert.alert("Could not start deletion", result.error.message);
            } else {
              await signOut();
            }
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
      />

      <SectionHeader title="Privacy" />
      <Card>
        <SettingsRow
          title="Public profile"
          body="Allow people outside your circles to view your basic profile."
          value={publicProfile}
          onValueChange={(next) => savePrivacy(next, publicWall)}
        />
        <SettingsRow
          title="Public Wall visibility"
          body="Allow eligible misses to appear beyond private circles."
          value={publicWall}
          onValueChange={(next) => savePrivacy(publicProfile, next)}
        />
        {privacyMutation.error ? (
          <Text variant="caption" style={{ color: colors.missed }}>
            {privacyMutation.error.message}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Account" />
      <Button
        title="Manage subscription"
        variant="secondary"
        onPress={() =>
          Linking.openURL("https://apps.apple.com/account/subscriptions")
        }
      />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button title="Delete account" variant="danger" onPress={deletion} />
    </Screen>
  );
}
