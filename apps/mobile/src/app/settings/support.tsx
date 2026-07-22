import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import {
  Button,
  Card,
  Field,
  Header,
  Screen,
  Text,
} from "../../components/ui";
import { submitSupportRequest } from "../../features/moderation/api";
import { colors, spacing } from "../../theme/tokens";

export default function SupportScreen() {
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: submitSupportRequest,
    onSuccess: () => {
      setMessage("");
      Alert.alert(
        "Message sent",
        "CalledOut support received your request. We may follow up through the email attached to your account.",
      );
    },
  });

  return (
    <Screen>
      <Header
        eyebrow="SUPPORT"
        title="How can we help?"
        subtitle="Send a private request to the CalledOut support queue."
        backLabel="Settings"
        onBack={router.back}
      />

      <Card style={{ gap: spacing.xs }}>
        <Text variant="bodyStrong">For safety issues involving another person</Text>
        <Text style={{ color: colors.textSecondary }}>
          Open that person's Wall history and use Report or Block. Those actions
          include the account context needed for moderation.
        </Text>
      </Card>

      <Field
        label="Support request"
        value={message}
        onChangeText={setMessage}
        placeholder="Describe the problem, what you expected, and what happened instead."
        multiline
        maxLength={1500}
        style={{ minHeight: 150, textAlignVertical: "top" }}
      />
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Do not include passwords, payment card numbers, or private authentication
        codes.
      </Text>

      {mutation.error ? (
        <Text style={{ color: colors.missed }}>{mutation.error.message}</Text>
      ) : null}

      <Button
        title="Send support request"
        loading={mutation.isPending}
        disabled={message.trim().length < 20}
        onPress={() => mutation.mutate(message)}
      />
    </Screen>
  );
}
