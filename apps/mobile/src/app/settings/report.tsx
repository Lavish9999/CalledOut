import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import {
  Button,
  Card,
  Field,
  Header,
  Screen,
  Text,
} from "../../components/ui";
import {
  reportUser,
  type ReportReason,
} from "../../features/moderation/api";
import { analytics } from "../../lib/analytics";
import { colors, radius, spacing } from "../../theme/tokens";

const reasons: { value: ReportReason; label: string; body: string }[] = [
  {
    value: "harassment",
    label: "Harassment or bullying",
    body: "Targeted insults, unwanted contact, or abusive callouts.",
  },
  {
    value: "inappropriate_content",
    label: "Inappropriate content",
    body: "Sexual, graphic, or otherwise unsuitable profile or proof content.",
  },
  {
    value: "spam_or_impersonation",
    label: "Spam or impersonation",
    body: "Fake identity, scams, repeated promotion, or misleading behavior.",
  },
  {
    value: "unsafe_behavior",
    label: "Unsafe behavior",
    body: "Threats, encouragement of harm, or dangerous conduct.",
  },
  {
    value: "other",
    label: "Other safety concern",
    body: "Something else that should be reviewed by CalledOut.",
  },
];

export default function ReportUserScreen() {
  const { userId, username, circleId } = useLocalSearchParams<{
    userId: string;
    username?: string;
    circleId?: string;
  }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  const mutation = useMutation({
    mutationFn: reportUser,
    onSuccess: () => {
      analytics.capture("report_submitted", { reason: reason ?? "unknown" });
      Alert.alert(
        "Report submitted",
        "CalledOut will review it privately. The person you reported is not notified who submitted it.",
        [{ text: "Done", onPress: router.back }],
        { cancelable: false },
      );
    },
  });

  function submit() {
    if (!reason || !userId) return;
    const context = circleId ? `Reported from circle ${circleId}.` : "Reported from The Wall.";
    mutation.mutate({
      reportedUserId: userId,
      reason,
      details: `${details.trim()}${details.trim() ? "\n\n" : ""}${context}`,
    });
  }

  return (
    <Screen>
      <Header
        eyebrow="SAFETY"
        title={`Report ${username ? `@${username}` : "this user"}`}
        subtitle="Reports are private and reviewed by CalledOut. Use Block after reporting when you do not want to see this person again."
        backLabel="Wall history"
        onBack={router.back}
      />

      <View style={{ gap: spacing.sm }}>
        {reasons.map((item) => {
          const selected = reason === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setReason(item.value)}
              style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
            >
              <Card
                style={{
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.dark : colors.border,
                  gap: spacing.xs,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: radius.pill,
                      borderWidth: 2,
                      borderColor: selected ? colors.dark : colors.border,
                      backgroundColor: selected ? colors.dark : colors.surface,
                    }}
                  />
                  <Text variant="bodyStrong">{item.label}</Text>
                </View>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {item.body}
                </Text>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Extra details (optional)"
        value={details}
        onChangeText={setDetails}
        placeholder="Tell us what happened. Do not include passwords or payment information."
        multiline
        maxLength={1000}
        style={{ minHeight: 120, textAlignVertical: "top" }}
      />

      {mutation.error ? (
        <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
      ) : null}

      <Button
        title="Submit private report"
        loading={mutation.isPending}
        disabled={!reason || !userId}
        onPress={submit}
      />
    </Screen>
  );
}
