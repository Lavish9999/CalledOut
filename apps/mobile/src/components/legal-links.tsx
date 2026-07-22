import { View } from "react-native";
import { router } from "expo-router";

import { Text } from "./ui";
import { colors, spacing } from "../theme/tokens";

export function LegalLinks({
  intro = "Review CalledOut's policies:",
}: {
  intro?: string;
}) {
  const links = [
    { label: "Terms of Use", path: "/legal/terms" },
    { label: "Privacy Policy", path: "/legal/privacy" },
    { label: "Community Guidelines", path: "/legal/community" },
  ];

  return (
    <View style={{ alignItems: "center", gap: spacing.xs }}>
      <Text
        variant="caption"
        style={{ color: colors.textSecondary, textAlign: "center" }}
      >
        {intro}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: spacing.sm,
        }}
      >
        {links.map((link) => (
          <Text
            key={link.path}
            variant="caption"
            onPress={() => router.push(link.path as never)}
            style={{ color: colors.text, textDecorationLine: "underline" }}
          >
            {link.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
