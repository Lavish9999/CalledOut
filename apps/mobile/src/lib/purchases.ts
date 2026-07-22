import { Linking, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from "react-native-purchases";

import { env } from "./env";

let configured = false;
let currentUserId: string | undefined;

export type PurchaseResult = {
  isPro: boolean;
  customerInfo: CustomerInfo;
};

export async function configurePurchases(userId?: string) {
  if (Platform.OS === "web") return;

  const apiKey =
    Platform.OS === "ios" ? env.revenueCatIosKey : env.revenueCatAndroidKey;
  if (!apiKey) return;

  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
    currentUserId = userId;
    return;
  }

  if (userId && userId !== currentUserId) {
    await Purchases.logIn(userId);
    currentUserId = userId;
  }
}

export async function resetPurchasesUser() {
  if (!configured || !currentUserId || Platform.OS === "web") return;

  try {
    await Purchases.logOut();
  } finally {
    currentUserId = undefined;
  }
}

export function purchasesConfigured() {
  return configured;
}

export async function getCustomerInfo() {
  if (!configured) return null;
  return Purchases.getCustomerInfo();
}

export async function getProStatus() {
  const info = await getCustomerInfo();
  return Boolean(info?.entitlements.active.pro);
}

export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return {
    isPro: Boolean(customerInfo.entitlements.active.pro),
    customerInfo,
  };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  const customerInfo = await Purchases.restorePurchases();
  return {
    isPro: Boolean(customerInfo.entitlements.active.pro),
    customerInfo,
  };
}

export function isPurchaseCancelled(error: unknown) {
  const value = error as Partial<PurchasesError> | null;
  return Boolean(
    value?.userCancelled ||
      value?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR,
  );
}

export async function openSubscriptionManagement() {
  const info = await getCustomerInfo();
  const url = info?.managementURL;

  if (url) {
    await Linking.openURL(url);
    return;
  }

  if (Platform.OS === "ios") {
    await Linking.openURL("https://apps.apple.com/account/subscriptions");
    return;
  }

  await Linking.openURL("https://play.google.com/store/account/subscriptions");
}
