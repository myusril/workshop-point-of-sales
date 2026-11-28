import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { migrate, resetStaleSending } from "@/src/db/repository";
import { useTheme } from "@/src/theme/ThemeProvider";

import { getRuntime } from "./runtime";

/** Opens and migrates the on-device database once, before any screen reads it. */
export function RuntimeProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const runtime = getRuntime();
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrate(runtime.db);
        await resetStaleSending(runtime.db, new Date().toISOString());
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) {
          setFailure("Penyimpanan lokal tidak dapat dibuka. Mulai ulang aplikasi.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  if (failure) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.bg.canvas,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing[24],
        }}
      >
        <Text
          style={[
            theme.type("body.lg"),
            { color: theme.color.status.danger.fg, textAlign: "center" },
          ]}
        >
          {failure}
        </Text>
      </View>
    );
  }

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: theme.color.bg.canvas }} />;
  }

  return <>{children}</>;
}
