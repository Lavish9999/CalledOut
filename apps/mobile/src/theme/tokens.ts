import { Platform } from 'react-native';

export const colors = {
  background: '#F6F6F3', text: '#111111', textSecondary: '#6F706C', surface: '#FFFFFF',
  border: '#E4E4DF', surfaceMuted: '#EFEFEB', verified: '#13A05A', missed: '#E5483F', warning: '#F3A83B', dark: '#171717',
  overlay: 'rgba(17,17,17,0.52)', disabled: '#B8B9B4', transparent: 'transparent',
} as const;
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, display: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;
export const typography = {
  display: { fontSize: 38, lineHeight: 42, fontWeight: '800' as const, letterSpacing: -1.1 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '800' as const, letterSpacing: -0.7 },
  section: { fontSize: 21, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.25 },
  card: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '800' as const, letterSpacing: 0.9 },
};
export const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });
