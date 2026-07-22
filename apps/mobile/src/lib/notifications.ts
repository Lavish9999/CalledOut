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
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
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
