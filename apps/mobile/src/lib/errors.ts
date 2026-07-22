export function messageFor(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("network connection was lost") ||
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch")
  ) {
    return "CalledOut could not reach the sign-in service. Check your connection and try again. If other apps are online, the preview build is using the wrong Supabase environment settings.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "That email and password combination is not correct.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirm your email first, then return to CalledOut and sign in.";
  }

  return message || "Something went wrong. Please try again.";
}
