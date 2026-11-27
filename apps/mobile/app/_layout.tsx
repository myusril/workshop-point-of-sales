import { useEffect } from "react";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/src/app/AuthProvider";
import { AutoLock } from "@/src/app/AutoLock";
import { RuntimeProvider } from "@/src/app/RuntimeProvider";
import { SaleProvider } from "@/src/app/SaleProvider";
import { SessionGate } from "@/src/app/SessionGate";
import { SyncProvider } from "@/src/app/SyncProvider";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SaleBoundary() {
  const { session } = useAuth();
  const identity = session
    ? `${session.user.id}:${session.activeOutletId}`
    : "signed-out";
  return (
    <SaleProvider key={identity}>
      <AutoLock>
        <SessionGate />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
      </AutoLock>
    </SaleProvider>
  );
}

function AppShell() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <RuntimeProvider>
        <AuthProvider>
          <SyncProvider>
            <SaleBoundary />
          </SyncProvider>
        </AuthProvider>
      </RuntimeProvider>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
