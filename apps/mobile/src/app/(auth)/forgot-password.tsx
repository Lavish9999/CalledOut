import { useState } from "react";
import { router } from "expo-router";

import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: "calledout://auth/reset" },
    );
    if (resetError) setError(resetError.message);
    else setSent(true);
    setLoading(false);
  }

  return (
    <Screen>
      <Header
        title="Reset password"
        subtitle="We will email a secure reset link."
        backLabel="Sign in"
        onBack={router.back}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {sent ? (
        <Text style={{ color: colors.verified }}>Reset link sent.</Text>
      ) : null}
      {error ? <Text style={{ color: colors.missed }}>{error}</Text> : null}
      <Button
        title="Send reset link"
        loading={loading}
        disabled={!email.includes("@")}
        onPress={submit}
      />
    </Screen>
  );
}
