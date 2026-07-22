import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

async function encryptionKey() {
  const material = new TextEncoder().encode(
    required("APPLE_TOKEN_ENCRYPTION_KEY"),
  );
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function appleClientId() {
  return Deno.env.get("APPLE_CLIENT_ID")?.trim() || "com.calledout.app";
}

export function appleRevocationConfigured() {
  return Boolean(
    Deno.env.get("APPLE_TEAM_ID") &&
      Deno.env.get("APPLE_KEY_ID") &&
      Deno.env.get("APPLE_PRIVATE_KEY") &&
      Deno.env.get("APPLE_TOKEN_ENCRYPTION_KEY"),
  );
}

export async function createAppleClientSecret() {
  const teamId = required("APPLE_TEAM_ID");
  const keyId = required("APPLE_KEY_ID");
  const privateKey = required("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const signingKey = await importPKCS8(privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setAudience("https://appleid.apple.com")
    .setSubject(appleClientId())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
}

export async function exchangeAppleAuthorizationCode(code: string) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appleClientId(),
      client_secret: await createAppleClientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (
    !response.ok ||
    typeof payload.refresh_token !== "string" ||
    typeof payload.id_token !== "string"
  ) {
    throw new Error(
      `Apple token exchange failed: ${payload.error_description ?? payload.error ?? response.status}`,
    );
  }

  return {
    refreshToken: payload.refresh_token as string,
    idToken: payload.id_token as string,
  };
}

export function appleSubjectFromIdToken(idToken: string) {
  const segments = idToken.split(".");
  if (segments.length !== 3) throw new Error("Apple identity token is invalid");

  const payload = JSON.parse(decodeBase64Url(segments[1]));
  if (payload.aud !== appleClientId() || typeof payload.sub !== "string") {
    throw new Error("Apple identity token has an invalid audience or subject");
  }

  return payload.sub as string;
}

export async function encryptAppleRefreshToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptAppleRefreshToken(value: string) {
  const [ivValue, ciphertextValue] = value.split(".");
  if (!ivValue || !ciphertextValue) {
    throw new Error("Stored Apple token is invalid");
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    await encryptionKey(),
    base64ToBytes(ciphertextValue),
  );

  return new TextDecoder().decode(plaintext);
}

export async function revokeAppleRefreshToken(token: string) {
  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appleClientId(),
      client_secret: await createAppleClientSecret(),
      token,
      token_type_hint: "refresh_token",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Apple token revocation failed: ${detail || response.status}`);
  }
}
