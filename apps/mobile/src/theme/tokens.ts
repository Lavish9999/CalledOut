import { Platform, type TextStyle } from "react-native";

export const colors = {
  background: "#F6F6F3",
  text: "#111111",
  textSecondary: "#6F706C",
  surface: "#FFFFFF",
  surfaceMuted: "#EFEFEB",
  border: "#E4E4DF",
  verified: "#13A05A",
  missed: "#E5483F",
  warning: "#F3A83B",
  dark: "#171717",
  overlay: "rgba(17,17,17,0.52)",
  disabled: "#B8B9B4",
  transparent: "transparent",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * React Native's iOS System family resolves to San Francisco (SF Pro).
 * Android deliberately uses its native system sans rather than bundling
 * Apple's proprietary font files.
 */
export const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "system-ui",
});

const font = (style: TextStyle): TextStyle => ({
  fontFamily,
  ...style,
});

export const typography = {
  display: font({
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -1.1,
  }),
  title: font({
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.7,
  }),
  section: font({
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.25,
  }),
  card: font({
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  }),
  body: font({
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "400",
  }),
  bodyStrong: font({
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  }),
  caption: font({
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  }),
  label: font({
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.9,
  }),
} as const;
