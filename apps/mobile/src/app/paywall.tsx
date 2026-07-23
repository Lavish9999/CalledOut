import { useEffect,useMemo,useState } from 'react';
import { router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { View } from 'react-native';
import { Button,Card,Header,Loading,Notice,Screen,StatusPill,Text } from '../components/ui';
import { getPackages,purchasePackage,restorePurchases } from '../lib/purchases';
import { analytics } from '../lib/analytics';
import { colors,spacing } from '../theme/tokens';
import { useSession } from '../providers/session';

const features=[
  ['Commitments','1 recurring schedule','Unlimited schedules'],
  ['Circles','1 private circle','Multiple private circles'],
  ['History','7-day record','Full accountability history'],
  ['Proof','Fresh live photo','Photo + location proof'],
  ['Consequences','Standard redemption','Custom consequences and windows'],
  ['Analytics','Basic completion','Detailed trends and records'],
];

export default function Paywall(){
  const[packages,setPackages]=useState<PurchasesPackage[]>([]);const[loading,setLoading]=useState(true);const[message,setMessage]=useState('');
  const{isPro,refreshEntitlement}=useSession();
  useEffect(()=>{analytics.capture('paywall_viewed');getPackages().then(setPackages).catch(e=>setMessage(e instanceof Error?e.message:'Store unavailable.')).finally(()=>setLoading(false));},[]);
  const annual=packages.find(p=>p.packageType==='ANNUAL');const monthly=packages.find(p=>p.packageType==='MONTHLY');
  const savings=useMemo(()=>annual&&monthly?Math.max(0,Math.round((1-annual.product.price/(monthly.product.price*12))*100)):0,[annual,monthly]);
  async function buy(p:PurchasesPackage){setLoading(true);setMessage('');try{const pro=await purchasePackage(p);if(pro){analytics.capture('subscription_started',{package:p.identifier});await refreshEntitlement();router.back();}}catch(e){setMessage(e instanceof Error?e.message:'Purchase could not be completed.');}finally{setLoading(false);}}
  return <Screen>
    <Header eyebrow="CALLEDOUT PRO" title="Make excuses harder." subtitle="Upgrade the accountability system—not the ability to submit proof."/>
    {isPro?<Notice title="Pro is active" body="Your account currently has CalledOut Pro access." tone="success"/>:null}
    <Card style={{backgroundColor:colors.dark,borderColor:colors.dark}}><StatusPill status="PRO"/><Text variant="display" style={{color:colors.surface}}>More witnesses. More rules. Full receipts.</Text><Text style={{color:colors.surface}}>Built for people running multiple promises, circles, and custom consequences.</Text></Card>
    <View style={{gap:spacing.xs}}>{features.map(([name,free,pro])=><Card key={name}><Text variant="label">{name.toUpperCase()}</Text><View style={{flexDirection:'row',gap:spacing.md}}><View style={{flex:1}}><Text variant="caption" style={{color:colors.textSecondary}}>FREE</Text><Text>{free}</Text></View><View style={{flex:1}}><Text variant="caption" style={{color:colors.verified}}>PRO</Text><Text variant="bodyStrong">{pro}</Text></View></View></Card>)}</View>
    {loading?<Loading/>:<>
      {annual?<Card style={{borderColor:colors.text,borderWidth:1.5}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View><Text variant="label">BEST VALUE</Text><Text variant="section">Annual · {annual.product.priceString}</Text></View>{savings>0?<StatusPill status={`save ${savings}%`}/>:null}</View><Text variant="caption" style={{color:colors.textSecondary}}>Billed once per year. Cancel renewal anytime in your store account.</Text><Button title={isPro?'Pro active':'Choose annual'} disabled={isPro} onPress={()=>buy(annual)}/></Card>:null}
      {monthly?<Card><Text variant="section">Monthly · {monthly.product.priceString}</Text><Text variant="caption" style={{color:colors.textSecondary}}>Flexible monthly access.</Text><Button title={isPro?'Pro active':'Choose monthly'} variant="secondary" disabled={isPro} onPress={()=>buy(monthly)}/></Card>:null}
      {!packages.length?<Notice title="Store products unavailable" body="Verify RevenueCat keys, product identifiers, and the current offering for this build." tone="warning"/>:null}
    </>}
    {message?<Notice title="Purchase status" body={message} tone="warning"/>:null}
    <Text variant="caption" style={{color:colors.textSecondary,textAlign:'center'}}>Payment is charged through Apple or Google. Subscriptions renew automatically unless cancelled before the current billing period ends. Proof submission remains available if Pro expires.</Text>
    <Button title="Restore purchases" variant="secondary" loading={loading} disabled={loading} onPress={async()=>{setLoading(true);setMessage('');try{const pro=await restorePurchases();await refreshEntitlement();analytics.capture('subscription_restore_completed',{active:pro});setMessage(pro?'Purchases restored.':'No active CalledOut Pro entitlement was found.');}catch(e){analytics.capture('subscription_restore_failed');setMessage(e instanceof Error?e.message:'Purchases could not be restored.');}finally{setLoading(false);}}}/>
    <Button title="Not now" variant="ghost" onPress={()=>router.back()}/>
  </Screen>;
}
