import { Tabs } from "expo-router";
import { Boxes, ClipboardList, Menu, ShoppingCart } from "lucide-react-native";
import type { ComponentType } from "react";
import { View } from "react-native";

import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/theme/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Four task-named tabs (DESIGN §7.1), role-aware. A Mechanic has no dead "Jual"
 * tab; a Cashier sees all four but stock is a read-only lookup. Tablet keeps the
 * same components with a wider layout.
 */

function TabIcon({
  icon: Icon,
  focused,
  color,
}: {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  focused: boolean;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", gap: theme.spacing[2] }}>
      <View
        style={{
          height: 3,
          width: 24,
          borderRadius: 2,
          backgroundColor: focused ? theme.color.accent.default : "transparent",
        }}
      />
      <Icon size={theme.size.iconLg} color={color} strokeWidth={focused ? 2.4 : 1.8} />
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const role = session?.user.role ?? "CASHIER";
  const showSale = role !== "MECHANIC";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent.default,
        tabBarInactiveTintColor: theme.color.text.secondary,
        tabBarStyle: {
          // The navigator adds bottom inset padding inside this height; reserve
          // it so the 64 dp content area is not eaten by the system bar.
          height: theme.size.mobileTabBar + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: theme.color.bg.surface,
          borderTopColor: theme.color.border.subtle,
          paddingTop: theme.spacing[4],
        },
        tabBarLabelStyle: {
          ...theme.type("caption"),
          fontSize: 12,
          marginTop: theme.spacing[2],
        },
        tabBarItemStyle: { paddingVertical: theme.spacing[4] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Jual",
          href: showSale ? undefined : null,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={ShoppingCart}
              focused={focused}
              color={typeof color === "string" ? color : theme.color.text.secondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pesanan"
        options={{
          title: "Pesanan",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={ClipboardList}
              focused={focused}
              color={typeof color === "string" ? color : theme.color.text.secondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stok"
        options={{
          title: "Stok",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={Boxes}
              focused={focused}
              color={typeof color === "string" ? color : theme.color.text.secondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="lainnya"
        options={{
          title: "Lainnya",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={Menu}
              focused={focused}
              color={typeof color === "string" ? color : theme.color.text.secondary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
