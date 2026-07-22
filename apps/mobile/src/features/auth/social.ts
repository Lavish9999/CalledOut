import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthResult = { cancelled: boolean };

function callbackUrl() {
  return makeRedirectUri({
    scheme: "calledout",
    path: "auth/callback",
  });
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
  const redirectTo = callbackUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in could not be started.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "cancel" || result.type === "dismiss") {
    return { cancelled: true };
  }
  if (result.type !== "success") {
    throw new Error("Google sign-in did not complete.");
  }

  const url = new URL(result.url);
  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) throw new Error(providerError);

  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error(
      "Google returned without an authorization code. Check the CalledOut redirect URL in Supabase Auth settings.",
    );
  }

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw exchange.error;

  return { cancelled: false };
}

export async function signInWithApple(): Promise<SocialAuthResult> {
  if (Platform.OS !== "ios") {
    throw new Error("Sign in with Apple is available on iPhone.");
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error("Apple did not return an identity token.");
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    return { cancelled: false };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("ERR_REQUEST_CANCELED") ||
        error.message.toLowerCase().includes("canceled"))
    ) {
      return { cancelled: true };
    }
    throw error;
  }
}
