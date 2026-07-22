import { Alert, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Button,
  Card,
  EmptyState,
  Header,
  Loading,
  Screen,
  Text,
} from "../../components/ui";
import {
  getBlockedUsers,
  unblockUser,
} from "../../features/moderation/api";
import { queryClient, qk } from "../../lib/query";
import { colors, spacing } from "../../theme/tokens";

export default function BlockedAccountsScreen() {
  const query = useQuery({ queryKey: qk.blocked, queryFn: getBlockedUsers });
  const mutation = useMutation({
    mutationFn: unblockUser,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.blocked }),
        queryClient.invalidateQueries({ queryKey: ["wall"] }),
        queryClient.invalidateQueries({ queryKey: qk.circles }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
    },
  });

  function confirmUnblock(userId: string, username: string) {
    Alert.alert(
      `Unblock @${username}?`,
      "You may see each other's profiles, activity, and Wall records again when circle and privacy rules allow it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => mutation.mutate(userId),
        },
      ],
    );
  }

  return (
    <Screen>
      <Header
        title="Blocked accounts"
        subtitle="Blocked people are hidden from your social and accountability surfaces."
        backLabel="Settings"
        onBack={router.back}
      />

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <EmptyState
          title="Could not load blocked accounts"
          body={query.error.message}
        />
      ) : query.data?.length ? (
        <View style={{ gap: spacing.sm }}>
          {query.data.map((item) => (
            <Card key={item.blocked_user_id} style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xxs }}>
                <Text variant="section">{item.display_name}</Text>
                <Text style={{ color: colors.textSecondary }}>
                  @{item.username}
                </Text>
              </View>
              <Button
                title="Unblock"
                variant="secondary"
                compact
                loading={
                  mutation.isPending &&
                  mutation.variables === item.blocked_user_id
                }
                onPress={() =>
                  confirmUnblock(item.blocked_user_id, item.username)
                }
              />
            </Card>
          ))}
          {mutation.error ? (
            <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
          ) : null}
        </View>
      ) : (
        <EmptyState
          title="No blocked accounts"
          body="People you block will appear here so you can reverse the decision later."
        />
      )}
    </Screen>
  );
}
