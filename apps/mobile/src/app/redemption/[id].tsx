import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { Button, Card, Header, Screen, Text } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";

export default function Redemption() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Commitment is missing.");
      const { error } = await supabase.rpc("start_redemption", {
        p_commitment_id: id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      analytics.capture("redemption_started");
      await queryClient.invalidateQueries({ queryKey: qk.today });
      router.back();
    },
  });

  return (
    <Screen>
      <Header
        title="Redemption"
        subtitle="The miss remains in history. The status can still change."
        backLabel="Today"
        onBack={router.back}
      />
      <Card>
        <Text variant="section">
          Complete a verified 30-minute workout within 24 hours.
        </Text>
        <Text>
          Once started, a redemption commitment appears on Today and uses the
          normal fresh-proof flow.
        </Text>
      </Card>
      {mutation.error ? <Text>{mutation.error.message}</Text> : null}
      <Button
        title="Start redemption"
        loading={mutation.isPending}
        disabled={!id}
        onPress={() => mutation.mutate()}
      />
    </Screen>
  );
}
