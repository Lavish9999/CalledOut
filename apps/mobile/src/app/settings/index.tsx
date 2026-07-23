import { Alert,Linking,Platform,Switch,View } from 'react-native';
import { router } from 'expo-router';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Button,Card,Chip,Header,Loading,Notice,Screen,SectionTitle,Text } from '../../components/ui';
import { useSession } from '../../providers/session';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { getNotificationPreferences,NotificationPreferences,NotificationToggleKey,updateNotificationPreference,updateQuietHours } from '../../features/settings/api';
import { colors,spacing } from '../../theme/tokens';
import { queryClient } from '../../lib/query';

const notificationRows:{key:NotificationToggleKey;label:string;detail:string}[]=[
  {key:'morning_reminder',label:'Morning reminder',detail:'A daily reminder when a commitment is scheduled.'},
  {key:'two_hour_warning',label:'Two-hour warning',detail:'A warning before the deadline gets close.'},
  {key:'thirty_minute_warning',label:'Thirty-minute warning',detail:'The final standard deadline warning.'},
  {key:'proof_window_opened',label:'Proof window opened',detail:'Know when fresh proof becomes eligible.'},
  {key:'proof_results',label:'Proof decisions',detail:'Verification, review, or more-proof results.'},
  {key:'commitment_missed',label:'Missed commitment',detail:'Immediate notice when the ledger marks a miss.'},
  {key:'redemption_warning',label:'Redemption warning',detail:'Warnings before a redemption window expires.'},
  {key:'social_activity',label:'Circle activity',detail:'Reactions, member joins, and circle activity.'},
];

export default function Settings(){
  const{signOut,isPro}=useSession();
  const preferences=useQuery({queryKey:['notification-preferences'],queryFn:getNotificationPreferences});
  const quiet=useMutation({mutationFn:({start,end}:{start:string|null;end:string|null})=>updateQuietHours(start,end),onSuccess:()=>queryClient.invalidateQueries({queryKey:['notification-preferences']})});
  const update=useMutation({mutationFn:({key,value}:{key:NotificationToggleKey;value:boolean})=>updateNotificationPreference(key,value),onMutate:async({key,value})=>{await queryClient.cancelQueries({queryKey:['notification-preferences']});const previous=queryClient.getQueryData<NotificationPreferences>(['notification-preferences']);queryClient.setQueryData<NotificationPreferences>(['notification-preferences'],old=>old?{...old,[key]:value}:old);return{previous};},onError:(_e,_v,context)=>queryClient.setQueryData(['notification-preferences'],context?.previous),onSettled:()=>queryClient.invalidateQueries({queryKey:['notification-preferences']})});
  async function deletion(){Alert.alert('Delete account?','This starts deletion, signs you out, and removes social visibility. Legal, fraud-prevention, and financial records may be retained only for the disclosed period.',[{text:'Cancel',style:'cancel'},{text:'Delete account',style:'destructive',onPress:async()=>{const r=await supabase.functions.invoke('request-account-deletion');if(r.error)Alert.alert('Could not start deletion',r.error.message);else await signOut();}}]);}
  function contact(){if(env.supportEmail)Linking.openURL(`mailto:${env.supportEmail}?subject=CalledOut%20Support`);else Alert.alert('Support email not configured','Set EXPO_PUBLIC_SUPPORT_EMAIL before the store build.');}
  return <Screen>
    <Header title="Settings & privacy" subtitle="Control notifications, safety, billing, and account data."/>
    <SectionTitle title="Notifications"/>
    {preferences.isLoading?<Loading/>:notificationRows.map(row=><Card key={row.key}><View style={{flexDirection:'row',alignItems:'center',gap:spacing.md}}><View style={{flex:1}}><Text variant="bodyStrong">{row.label}</Text><Text variant="caption" style={{color:colors.textSecondary}}>{row.detail}</Text></View><Switch value={Boolean(preferences.data?.[row.key])} onValueChange={value=>update.mutate({key:row.key,value})}/></View></Card>)}
    <Card><Text variant="bodyStrong">Quiet hours</Text><Text variant="caption" style={{color:colors.textSecondary}}>Deadline jobs still run. Non-urgent push delivery waits until quiet hours end.</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}><Chip label="Off" selected={!preferences.data?.quiet_hours_start} onPress={()=>quiet.mutate({start:null,end:null})}/><Chip label="10 PM–7 AM" selected={preferences.data?.quiet_hours_start?.startsWith('22:00')} onPress={()=>quiet.mutate({start:'22:00:00',end:'07:00:00'})}/><Chip label="11 PM–8 AM" selected={preferences.data?.quiet_hours_start?.startsWith('23:00')} onPress={()=>quiet.mutate({start:'23:00:00',end:'08:00:00'})}/></View></Card>
    <SectionTitle title="Safety & policies"/>
    <Notice title="Private by default" body="Proof is visible only to authorized circle members unless you explicitly opt into a broader scope. Exact location is never shown to friends."/>
    <Button title="Community guidelines" variant="secondary" onPress={()=>router.push('/legal/community' as never)}/>
    <Button title="Privacy policy" variant="secondary" onPress={()=>router.push('/legal/privacy' as never)}/>
    <Button title="Terms of use" variant="secondary" onPress={()=>router.push('/legal/terms' as never)}/>
    <Button title="Contact support" variant="secondary" onPress={contact}/>
    <SectionTitle title="Billing & account"/>
    <Button title={isPro?'Pro is active':'CalledOut Pro'} variant="secondary" onPress={()=>router.push('/paywall')}/>
    <Button title="Manage store subscription" variant="secondary" onPress={()=>Linking.openURL(Platform.OS==='ios'?'https://apps.apple.com/account/subscriptions':'https://play.google.com/store/account/subscriptions')}/>
    <Button title="Sign out" variant="secondary" onPress={signOut}/>
    <Button title="Delete account" variant="danger" onPress={deletion}/>
  </Screen>;
}
