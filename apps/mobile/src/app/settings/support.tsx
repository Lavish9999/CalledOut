import { useState } from "react";
import { Alert, Linking } from "react-native";
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

const SUPPORT_EMAIL = "robbieyisa2@icloud.com";

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
        subtitle="Send a private request to the CalledOut support queue. Typical response time is within two business days."
        backLabel="Settings"
        onBack={router.back}
      />

      <Card style={{ gap: spacing.xs }}>
        <Text variant="bodyStrong">Direct email</Text>
        <Text style={{ color: colors.textSecondary }}>
          Locked out or unable to use the form? Email {SUPPORT_EMAIL}.
        </Text>
        <Button
          title="Email CalledOut support"
          variant="secondary"
          onPress={() =>
            Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("CalledOut support request")}`,
            )
          }
        />
      </Card>

      <Card style={{ gap: spacing.xs }}>
        <Text variant="bodyStrong">For safety issues involving another person</Text>
        <Text style={{ color: colors.textSecondary }}>
          Open that person’s Wall history and use Report or Block. Those actions
          include the account context needed for moderation. For a credible threat,
          doxxing, or non-consensual content, put “Urgent safety concern” in the
          email subject. Contact local emergency services for immediate danger.
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
