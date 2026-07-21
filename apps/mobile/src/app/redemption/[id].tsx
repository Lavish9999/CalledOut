import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, Header, Screen, Text } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { queryClient, qk } from "../../lib/query";
import { analytics } from "../../lib/analytics";
export default function Redemption() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useMutation({
    mutationFn: async () => {
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
      <Button
        title="Start redemption"
        loading={m.isPending}
        onPress={() => m.mutate()}
      />
      <Button title="Not now" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
