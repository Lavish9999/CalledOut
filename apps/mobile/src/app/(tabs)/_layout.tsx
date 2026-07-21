import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";

import { colors, fontFamily } from "../../theme/tokens";

function TabIcon({
  name,
  color,
  size,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: ColorValue;
  size: number;
}) {
  return <Ionicons name={name} color={color as string} size={size} />;
}

const icon = (name: React.ComponentProps<typeof Ionicons>["name"]) =>
  function IconRenderer({ color, size }: { color: ColorValue; size: number }) {
    return <TabIcon name={name} color={color} size={size} />;
  };

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 82,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "TODAY", tabBarIcon: icon("today-outline") }}
      />
      <Tabs.Screen
        name="wall"
        options={{ title: "THE WALL", tabBarIcon: icon("podium-outline") }}
      />
      <Tabs.Screen
        name="circles"
        options={{ title: "CIRCLES", tabBarIcon: icon("people-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "PROFILE", tabBarIcon: icon("person-outline") }}
      />
    </Tabs>
  );
}
