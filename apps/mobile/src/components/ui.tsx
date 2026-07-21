import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import {
  colors,
  fontFamily,
  radius,
  spacing,
  typography,
} from "../theme/tokens";

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const content = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Text({
  children,
  variant = "body",
  style,
  numberOfLines,
  onPress,
}: {
  children: React.ReactNode;
  variant?: keyof typeof typography;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  onPress?: () => void;
}) {
  return (
    <RNText
      onPress={onPress}
      numberOfLines={numberOfLines}
      style={[{ color: colors.text }, typography[variant], style]}
    >
      {children}
    </RNText>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  compact = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const foreground =
    variant === "primary" || variant === "danger"
      ? colors.surface
      : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        styles[`button_${variant}`],
        pressed && !disabled && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text variant="bodyStrong" style={{ color: foreground }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  error,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption">{label}</Text>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        {...props}
        style={[styles.input, props.style]}
        accessibilityLabel={label}
      />
      {error ? (
        <Text variant="caption" style={{ color: colors.missed }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  const backgroundColor = key.includes("verified")
    ? colors.verified
    : key.includes("miss") || key.includes("reject") || key.includes("expired")
      ? colors.missed
      : key.includes("redeem") || key.includes("review")
        ? colors.warning
        : colors.dark;

  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Text variant="label" style={{ color: colors.surface }}>
        {status.replaceAll("_", " ").toUpperCase()}
      </Text>
    </View>
  );
}

export function Header({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      {eyebrow ? (
        <Text variant="label" style={{ color: colors.textSecondary }}>
          {eyebrow}
        </Text>
      ) : null}
      <View style={styles.headerRow}>
        <Text variant="title" style={{ flex: 1 }}>
          {title}
        </Text>
        {action}
      </View>
      {subtitle ? (
        <Text style={{ color: colors.textSecondary }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="label" style={{ color: colors.textSecondary }}>
        {title.toUpperCase()}
      </Text>
      {action}
    </View>
  );
}

export function Metric({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <Card style={styles.metric}>
      <Text variant="title">{value}</Text>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
    </Card>
  );
}

export function SettingsRow({
  title,
  body,
  value,
  onValueChange,
}: {
  title: string;
  body?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.settingsRow}>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="bodyStrong">{title}</Text>
        {body ? (
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {body}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card style={styles.emptyState}>
      <Text variant="section">{title}</Text>
      <Text style={{ textAlign: "center", color: colors.textSecondary }}>
        {body}
      </Text>
      {action}
    </Card>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  buttonCompact: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  button_primary: {
    backgroundColor: colors.dark,
    borderColor: colors.dark,
  },
  button_secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  button_danger: {
    backgroundColor: colors.missed,
    borderColor: colors.missed,
  },
  button_ghost: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.48,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily,
    fontSize: 16,
    color: colors.text,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
  },
  metric: {
    flex: 1,
    minWidth: 140,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  loading: {
    padding: spacing.xxl,
    alignItems: "center",
  },
});
