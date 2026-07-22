import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const SAFE_NOTIFICATION_ROUTES = [
  "/commitment/",
  "/circle/review/",
  "/circle/",
  "/wall",
  "/profile/subscription",
] as const;

export function notificationRoute(
  response: Notifications.NotificationResponse | null | undefined,
) {
  if (
    response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
  ) {
    return null;
  }

  const value = response.notification.request.content.data?.route;
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  if (!SAFE_NOTIFICATION_ROUTES.some((prefix) => value.startsWith(prefix))) {
    return null;
  }
  return value;
}

export async function registerPushToken(userId: string) {
  if (!Device.isDevice) return null;

  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === "granted"
      ? current
      : await Notifications.requestPermissionsAsync();

  if (permission.status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("commitments", {
      name: "Commitments",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
  ).data;

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) throw error;
  return token;
}
