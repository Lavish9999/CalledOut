import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Screen, Text } from '../../components/ui';
import { colors, spacing } from '../../theme/tokens';
export default function Welcome(){return <Screen contentStyle={{flex:1,justifyContent:'space-between'}}><View style={{gap:spacing.md,marginTop:spacing.display}}><Text variant="label" style={{color:colors.missed}}>CALLEDOUT</Text><Text variant="display">You said you were going.</Text><Text style={{color:colors.textSecondary}}>CalledOut makes sure your friends know whether you showed up.</Text></View><View style={{gap:spacing.sm}}><Button title="Get called out" onPress={()=>router.push('/(auth)/sign-up')}/><Button title="I already have an account" variant="secondary" onPress={()=>router.push('/(auth)/sign-in')}/></View></Screen>}
