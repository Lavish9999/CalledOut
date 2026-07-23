import { router } from 'expo-router';
import { View } from 'react-native';
import { Button,Card,Header,Metric,Screen,StatusPill,Text } from '../../components/ui';
import { useSession } from '../../providers/session';
import { colors,spacing } from '../../theme/tokens';

export default function Profile(){
  const{profile,isPro}=useSession();
  return <Screen>
    <Header title={profile?.display_name??'Profile'} subtitle={`@${profile?.username??''}`} action={isPro?<StatusPill status="PRO"/>:undefined}/>
    <Text style={{color:colors.textSecondary}}>{profile?.bio||'No bio. Just receipts.'}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}}><Metric label="CURRENT STREAK" value={profile?.current_streak??0}/><Metric label="LONGEST STREAK" value={profile?.longest_streak??0}/><Metric label="COMPLETION" value={`${Math.round(profile?.completion_rate??0)}%`}/></View>
    <Card><Text variant="section">Your record</Text><Text>Verified workouts, visible misses, and completed redemptions are calculated from the commitment ledger—not manually entered profile numbers.</Text></Card>
    <Button title="Accountability insights" variant="secondary" onPress={()=>isPro?router.push('/profile/insights'):router.push('/paywall')}/><Button title="Manage recurring commitments" variant="secondary" onPress={()=>router.push('/commitment/manage')}/><Button title={isPro?'Manage CalledOut Pro':'Unlock CalledOut Pro'} onPress={()=>router.push('/paywall')}/>
    <Button title="Settings, safety & privacy" variant="secondary" onPress={()=>router.push('/settings')}/>
  </Screen>;
}
