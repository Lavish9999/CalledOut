import { useState } from "react";
import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/tokens";
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    const { error: e } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: "calledout://auth/reset" },
    );
    if (e) setError(e.message);
    else setSent(true);
  }
  return (
    <Screen>
      <Header
        title="Reset password"
        subtitle="We will email a secure reset link."
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {sent ? (
        <Text style={{ color: colors.verified }}>Reset link sent.</Text>
      ) : null}
      {error ? <Text style={{ color: colors.missed }}>{error}</Text> : null}
      <Button title="Send reset link" onPress={submit} />
    </Screen>
  );
}
