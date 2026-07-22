import { useState } from "react";
import { router } from "expo-router";

import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { messageFor } from "../../lib/errors";
import { spacing, colors } from "../../theme/tokens";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error) setError(messageFor(result.error));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Header
        title="Welcome back"
        subtitle="Your record did not disappear."
        backLabel="Welcome"
        onBack={router.back}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error ? <Text style={{ color: colors.missed }}>{error}</Text> : null}
      <Button
        title="Sign in"
        loading={loading}
        disabled={!email.includes("@") || !password}
        onPress={submit}
      />
      <Button
        title="Forgot password"
        variant="ghost"
        onPress={() => router.push("/(auth)/forgot-password")}
      />
      <Text
        style={{
          textAlign: "center",
          color: colors.textSecondary,
          marginTop: spacing.md,
        }}
        onPress={() => router.push("/(auth)/sign-up")}
      >
        No account? Create one.
      </Text>
    </Screen>
  );
}
