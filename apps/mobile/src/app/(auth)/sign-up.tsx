import { useState } from "react";
import { Platform } from "react-native";
import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { LegalLinks } from "../../components/legal-links";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { messageFor } from "../../lib/errors";
import { analytics } from "../../lib/analytics";
import {
  signInWithApple,
  signInWithGoogle,
} from "../../features/auth/social";
import { colors } from "../../theme/tokens";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"apple" | "google" | null>(
    null,
  );

  async function emailSignUp() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: "calledout://auth/callback" },
      });
      if (authError) throw authError;
      analytics.capture("account_created", { method: "email" });
      setNotice(
        "Check your email to confirm the account, then return to CalledOut.",
      );
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }

  async function social(provider: "apple" | "google") {
    setSocialLoading(provider);
    setError("");
    setNotice("");
    try {
      const result =
        provider === "apple"
          ? await signInWithApple()
          : await signInWithGoogle();
      if (!result.cancelled) {
        analytics.capture("account_created", { method: provider });
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSocialLoading(null);
    }
  }

  return (
    <Screen>
      <Header
        title="Create your account"
        subtitle="Use a display name. Legal names are not required."
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
        error={
          password && password.length < 10
            ? "Use at least 10 characters."
            : undefined
        }
      />
      {error ? <Text style={{ color: colors.missed }}>{error}</Text> : null}
      {notice ? <Text style={{ color: colors.verified }}>{notice}</Text> : null}
      <Button
        title="Create account"
        loading={loading}
        disabled={
          Boolean(socialLoading) || password.length < 10 || !email.includes("@")
        }
        onPress={emailSignUp}
      />
      <Text
        style={{ textAlign: "center", color: colors.textSecondary }}
        onPress={() => router.push("/(auth)/sign-in")}
      >
        Already have an account? Sign in.
      </Text>
      <LegalLinks intro="By continuing, you agree to CalledOut's policies:" />
    </Screen>
  );
}
