import { useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";

import { Button, Field, Header, Screen, Text } from "../../components/ui";
import {
  signInWithApple,
  signInWithGoogle,
} from "../../features/auth/social";
import { supabase } from "../../lib/supabase";
import { messageFor } from "../../lib/errors";
import { spacing, colors } from "../../theme/tokens";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"apple" | "google" | null>(
    null,
  );

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error) throw result.error;
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }

  async function social(provider: "apple" | "google") {
    setSocialLoading(provider);
    setError("");
    try {
      if (provider === "apple") await signInWithApple();
      else await signInWithGoogle();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSocialLoading(null);
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

      {Platform.OS === "ios" ? (
        <Button
          title="Continue with Apple"
          loading={socialLoading === "apple"}
          disabled={Boolean(socialLoading)}
          onPress={() => social("apple")}
        />
      ) : null}
      <Button
        title="Continue with Google"
        variant="secondary"
        loading={socialLoading === "google"}
        disabled={Boolean(socialLoading)}
        onPress={() => social("google")}
      />

      <Text
        variant="label"
        style={{ textAlign: "center", color: colors.textSecondary }}
      >
        OR EMAIL
      </Text>
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
        disabled={Boolean(socialLoading) || !email.includes("@") || !password}
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
