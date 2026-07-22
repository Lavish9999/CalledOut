import { useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { Button, Field, Header, Screen, Text } from "../../components/ui";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { messageFor } from "../../lib/errors";
import { analytics } from "../../lib/analytics";
import { colors } from "../../theme/tokens";
WebBrowser.maybeCompleteAuthSession();
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  async function emailSignUp() {
    setLoading(true);
    setError("");
    setNotice("");
    const { error: e } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: "calledout://auth/callback" },
    });
    if (e) setError(messageFor(e));
    else {
      analytics.capture("account_created", { method: "email" });
      setNotice(
        "Check your email to confirm the account, then return to CalledOut.",
      );
    }
    setLoading(false);
  }
  async function oauth(provider: "google") {
    const redirectTo = makeRedirectUri({
      scheme: "calledout",
      path: "auth/callback",
    });
    const { data, error: e } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (e || !data.url) {
      setError(messageFor(e));
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") {
      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (code) {
        const exchange = await supabase.auth.exchangeCodeForSession(code);
        if (exchange.error) setError(messageFor(exchange.error));
      }
    }
  }
  async function apple() {
    try {
      const c = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!c.identityToken)
        throw new Error("Apple did not return an identity token");
      const { error: e } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: c.identityToken,
        nonce: c.authorizationCode ?? undefined,
      });
      if (e) throw e;
      analytics.capture("account_created", { method: "apple" });
    } catch (e) {
      setError(messageFor(e));
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
        <Button title="Continue with Apple" onPress={apple} />
      ) : null}
      <Button
        title="Continue with Google"
        variant="secondary"
        onPress={() => oauth("google")}
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
        disabled={password.length < 10 || !email.includes("@")}
        onPress={emailSignUp}
      />
    </Screen>
  );
}
