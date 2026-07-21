import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, PurchasesPackage } from "react-native-purchases";
import { env } from "./env";
let configured = false;
export async function configurePurchases(userId?: string) {
  if (configured || Platform.OS === "web") return;
  const apiKey =
    Platform.OS === "ios" ? env.revenueCatIosKey : env.revenueCatAndroidKey;
  if (!apiKey) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey, appUserID: userId });
  configured = true;
}
export async function getProStatus() {
  if (!configured) return false;
  const info = await Purchases.getCustomerInfo();
  return Boolean(info.entitlements.active.pro);
}
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const o = await Purchases.getOfferings();
  return o.current?.availablePackages ?? [];
}
export async function purchasePackage(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return Boolean(customerInfo.entitlements.active.pro);
}
export async function restorePurchases() {
  const info = await Purchases.restorePurchases();
  return Boolean(info.entitlements.active.pro);
}
