import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { buildTheme, darkTheme, lightTheme, type AppTheme, type ThemeMode } from "./theme";

const ThemeContext = createContext<AppTheme>(lightTheme);

export function ThemeProvider({
  mode,
  children,
}: {
  mode?: ThemeMode;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const resolved: ThemeMode = mode ?? (system === "dark" ? "dark" : "light");
  const theme = useMemo(
    () => (resolved === "dark" ? darkTheme : lightTheme),
    [resolved],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

export { buildTheme, lightTheme, darkTheme };
export type { AppTheme, ThemeMode };
