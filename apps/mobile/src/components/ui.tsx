import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '../theme/tokens';

export function Screen({children,scroll=true,contentStyle}:{children:React.ReactNode;scroll?:boolean;contentStyle?:ViewStyle}){
  const content=<View style={[s.content,contentStyle]}>{children}</View>;
  return <SafeAreaView style={s.safe} edges={['top']}>{scroll?<ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{content}</ScrollView>:content}</SafeAreaView>;
}

export function Text({children,variant='body',style,numberOfLines,onPress}:{children:React.ReactNode;variant?:keyof typeof typography;style?:TextStyle|TextStyle[];numberOfLines?:number;onPress?:()=>void}){
  return <RNText onPress={onPress} numberOfLines={numberOfLines} style={[{color:colors.text},typography[variant],style]}>{children}</RNText>;
}

export function Button({title,onPress,variant='primary',disabled,loading,accessibilityLabel,compact}:{title:string;onPress:()=>void;variant?:'primary'|'secondary'|'danger'|'ghost';disabled?:boolean;loading?:boolean;accessibilityLabel?:string;compact?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel??title} accessibilityState={{disabled:Boolean(disabled||loading)}} disabled={disabled||loading} onPress={()=>{Haptics.selectionAsync().catch(()=>{});onPress();}} style={({pressed})=>[s.button,compact&&s.buttonCompact,s[`button_${variant}`],(pressed&&!disabled)&&s.pressed,(disabled||loading)&&s.disabled]}>
    {loading?<ActivityIndicator color={variant==='primary'||variant==='danger'?colors.surface:colors.text}/>:<Text variant="bodyStrong" style={{color:variant==='primary'||variant==='danger'?colors.surface:colors.text}}>{title}</Text>}
  </Pressable>;
}

export function Card({children,style,onPress}:{children:React.ReactNode;style?:ViewStyle|ViewStyle[];onPress?:()=>void}){
  const card=<View style={[s.card,style]}>{children}</View>;
  return onPress?<Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>pressed&&s.cardPressed}>{card}</Pressable>:card;
}

export function Field({label,error,...props}:React.ComponentProps<typeof TextInput>&{label:string;error?:string}){
  return <View style={{gap:spacing.xs}}><Text variant="caption">{label}</Text><TextInput placeholderTextColor={colors.textSecondary} {...props} style={[s.input,props.style]} accessibilityLabel={label}/>{error?<Text variant="caption" style={{color:colors.missed}}>{error}</Text>:null}</View>;
}

export function StatusPill({status}:{status:string}){
  const key=status.toLowerCase();
  const bg=key.includes('verified')||key.includes('redeemed')?colors.verified:key.includes('miss')||key.includes('reject')||key.includes('expired')?colors.missed:key.includes('redeem')||key.includes('review')||key.includes('submitted')?colors.warning:colors.dark;
  return <View style={[s.pill,{backgroundColor:bg}]}><Text variant="label" style={{color:colors.surface}}>{status.replaceAll('_',' ').toUpperCase()}</Text></View>;
}

export type HeaderProps={eyebrow?:string;title:string;subtitle?:string;action?:React.ReactNode;backLabel?:string;onBack?:()=>void};

export function Header({eyebrow,title,subtitle,action,backLabel,onBack}:HeaderProps){
  return <View style={{gap:spacing.xs}}>{onBack?<Pressable accessibilityRole="button" accessibilityLabel={backLabel??'Back'} onPress={onBack} style={({pressed})=>[s.backButton,pressed&&s.pressed]}><Text variant="caption">← {backLabel??'Back'}</Text></Pressable>:null}{eyebrow?<Text variant="label" style={{color:colors.textSecondary}}>{eyebrow}</Text>:null}<View style={s.headerRow}><Text variant="title" style={{flex:1}}>{title}</Text>{action}</View>{subtitle?<Text style={{color:colors.textSecondary}}>{subtitle}</Text>:null}</View>;
}

/** Compatibility export used by the settings and circle-management screens. */
export function SectionHeader(props:HeaderProps){return <Header {...props}/>;}

export function SectionTitle({title,action}:{title:string;action?:React.ReactNode}){
  return <View style={s.headerRow}><Text variant="section" style={{flex:1}}>{title}</Text>{action}</View>;
}

export function EmptyState({title,body,action}:{title:string;body:string;action?:React.ReactNode}){
  return <Card style={{alignItems:'center',gap:spacing.sm,paddingVertical:spacing.xxl}}><Text variant="section" style={{textAlign:'center'}}>{title}</Text><Text style={{textAlign:'center',color:colors.textSecondary}}>{body}</Text>{action}</Card>;
}

export function Chip({label,selected=false,onPress,disabled}:{label:string;selected?:boolean;onPress?:()=>void;disabled?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled:disabled||!onPress}} accessibilityLabel={label} disabled={disabled||!onPress} onPress={onPress} style={({pressed})=>[s.chip,selected&&s.chipSelected,pressed&&s.pressed,disabled&&s.disabled]}><Text variant="caption" style={{color:selected?colors.surface:colors.text}}>{label}</Text></Pressable>;
}

export function Segmented<T extends string>({value,options,onChange}:{value:T;options:{value:T;label:string}[];onChange:(value:T)=>void}){
  return <View style={s.segmented}>{options.map(option=><Pressable accessibilityRole="button" accessibilityState={{selected:value===option.value}} accessibilityLabel={option.label} key={option.value} onPress={()=>onChange(option.value)} style={[s.segment,value===option.value&&s.segmentActive]}><Text variant="caption" style={{color:value===option.value?colors.surface:colors.textSecondary}}>{option.label}</Text></Pressable>)}</View>;
}

export function Avatar({name,size=42}:{name:string;size?:number}){
  const initials=name.split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'?';
  return <View style={[s.avatar,{width:size,height:size,borderRadius:size/2}]}><Text variant="caption">{initials}</Text></View>;
}

export function Metric({label,value,detail,compact=false}:{label:string;value:string|number;detail?:string;compact?:boolean}){
  return <Card style={compact?[{flex:1,minWidth:96},{padding:spacing.md,gap:spacing.xs}]:{flex:1,minWidth:120}}><Text variant="label" style={{color:colors.textSecondary}}>{label}</Text><Text variant={compact?'section':'title'}>{value}</Text>{detail?<Text variant="caption" style={{color:colors.textSecondary}}>{detail}</Text>:null}</Card>;
}

export function Notice({title,body,tone='neutral'}:{title:string;body:string;tone?:'neutral'|'warning'|'success'}){
  const border=tone==='warning'?colors.warning:tone==='success'?colors.verified:colors.border;
  return <View style={[s.notice,{borderColor:border}]}><Text variant="bodyStrong">{title}</Text><Text variant="caption" style={{color:colors.textSecondary}}>{body}</Text></View>;
}

export function Divider(){return <View style={{height:1,backgroundColor:colors.border}}/>;}
export function Loading(){return <View style={{padding:spacing.xxl,alignItems:'center'}}><ActivityIndicator color={colors.text}/></View>;}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  scroll:{flexGrow:1},
  content:{padding:spacing.lg,gap:spacing.lg},
  button:{minHeight:52,borderRadius:radius.md,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.lg,borderWidth:1},
  buttonCompact:{minHeight:40,paddingHorizontal:spacing.md},
  button_primary:{backgroundColor:colors.dark,borderColor:colors.dark},
  button_secondary:{backgroundColor:colors.surface,borderColor:colors.border},
  button_danger:{backgroundColor:colors.missed,borderColor:colors.missed},
  button_ghost:{backgroundColor:colors.transparent,borderColor:colors.transparent},
  pressed:{transform:[{scale:0.98}],opacity:0.9},
  disabled:{opacity:0.48},
  card:{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.md},
  cardPressed:{opacity:.86,transform:[{scale:.995}]},
  input:{minHeight:50,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,paddingHorizontal:spacing.md,fontSize:16,color:colors.text},
  pill:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:6,borderRadius:radius.pill},
  headerRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm},
  backButton:{alignSelf:'flex-start',paddingVertical:spacing.xxs,paddingRight:spacing.sm},
  chip:{paddingHorizontal:14,paddingVertical:11,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  chipSelected:{backgroundColor:colors.dark,borderColor:colors.dark},
  segmented:{flexDirection:'row',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:4,gap:4},
  segment:{flex:1,minHeight:38,alignItems:'center',justifyContent:'center',borderRadius:radius.sm},
  segmentActive:{backgroundColor:colors.dark},
  avatar:{backgroundColor:colors.background,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  notice:{borderWidth:1,borderRadius:radius.md,padding:spacing.md,gap:spacing.xs,backgroundColor:colors.surface},
});
