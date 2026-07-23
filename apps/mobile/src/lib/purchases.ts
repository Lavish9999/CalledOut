import { Linking, Platform } from 'react-native';
import Purchases,{LOG_LEVEL,PurchasesPackage} from 'react-native-purchases';
import { env } from './env';

let configured=false;
let currentUserId:string|null=null;

export async function configurePurchases(userId?:string){
  if(Platform.OS==='web')return;
  const apiKey=Platform.OS==='ios'?env.revenueCatIosKey:env.revenueCatAndroidKey;
  if(!apiKey)return;
  Purchases.setLogLevel(__DEV__?LOG_LEVEL.DEBUG:LOG_LEVEL.ERROR);
  if(!configured){
    Purchases.configure({apiKey,appUserID:userId});
    configured=true;
    currentUserId=userId??null;
    return;
  }
  if(userId&&currentUserId!==userId){
    await Purchases.logIn(userId);
    currentUserId=userId;
  }
}

export async function clearPurchasesUser(){
  if(!configured||Platform.OS==='web')return;
  try{await Purchases.logOut();}catch{}
  currentUserId=null;
}

export async function getProStatus():Promise<{isPro:boolean}>{
  if(!configured)return {isPro:false};
  const info=await Purchases.getCustomerInfo();
  return {isPro:Boolean(info.entitlements.active.pro)};
}

export async function getPackages():Promise<PurchasesPackage[]>{
  if(!configured)return[];
  const offering=await Purchases.getOfferings();
  return offering.current?.availablePackages??[];
}

export async function purchasePackage(pkg:PurchasesPackage){
  const{customerInfo}=await Purchases.purchasePackage(pkg);
  return Boolean(customerInfo.entitlements.active.pro);
}

export async function restorePurchases(){
  const info=await Purchases.restorePurchases();
  return Boolean(info.entitlements.active.pro);
}

export async function openSubscriptionManagement(){
  const url=Platform.OS==='ios'
    ?'https://apps.apple.com/account/subscriptions'
    :'https://play.google.com/store/account/subscriptions';
  const supported=await Linking.canOpenURL(url);
  if(!supported)throw new Error('Subscription management is unavailable on this device.');
  await Linking.openURL(url);
}
