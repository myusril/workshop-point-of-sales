import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "./AuthProvider";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * One routing rule set for every entry: signed out → masuk, locked → kunci,
 * first sign-in → pin-baru, ready → Jual. The gate also keeps a deep link from
 * bypassing the lock screen after a restart.
 */

const AUTH_PATHS: Record<string, true> = {
  "/masuk": true,
  "/kunci": true,
  "/pin-baru": true,
};

export function SessionGate() {
  const { status, hasPin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    if (status === "loading") return;
    const onAuthPath = AUTH_PATHS[pathname] === true;

    if (status === "signedOut" && pathname !== "/masuk") {
      router.replace("/masuk");
      return;
    }
    if (status === "locked" && pathname !== "/kunci") {
      router.replace("/kunci");
      return;
    }
    if (status === "signedIn" && !hasPin && pathname !== "/pin-baru") {
      router.replace("/pin-baru");
      return;
    }
    if (status === "signedIn" && hasPin && onAuthPath) {
      router.replace("/");
    }
  }, [hasPin, pathname, router, status]);

  if (status === "loading") {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: theme.color.bg.canvas,
          alignItems: "center",
          justifyContent: "center",
          zIndex: theme.zIndex.toast,
        }}
      >
        <ActivityIndicator color={theme.color.accent.default} />
      </View>
    );
  }
  return null;
}
