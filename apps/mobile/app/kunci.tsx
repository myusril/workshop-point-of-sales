import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/providers/AuthProvider";
import { useSync } from "@/src/providers/SyncProvider";
import { PIN_LENGTH } from "@/src/auth/pin";
import { NumericKeypad } from "@/src/components/NumericKeypad";
import { Notice } from "@/src/components/forms";
import { TextLink } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function KunciScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, unlock, forgetDevice } = useAuth();
  const { pendingTotal, lastError } = useSync();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(pin: string) {
    if (checking) return;
    setChecking(true);
    try {
      const result = await unlock(pin);
      if (result.ok) {
        router.replace("/");
        return;
      }
      setMessage(result.message ?? "PIN tidak dapat diverifikasi.");
      setValue("");
      if (result.requiresFullLogin) {
        await forgetDevice();
        router.replace("/masuk");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <View style={{ flex: 1, padding: theme.spacing[16], gap: theme.spacing[16] }}>
        <View style={{ gap: theme.spacing[4] }}>
          <Text style={[theme.type("title.lg"), { color: theme.color.text.primary }]}>
            Perangkat terkunci
          </Text>
          <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
            {session?.user.name ?? "Pengguna"} ·{" "}
            {session?.user.role === "MECHANIC"
              ? "Mekanik"
              : session?.user.role === "CASHIER"
                ? "Kasir"
                : session?.user.role === "ADMIN"
                  ? "Admin"
                  : "Pemilik"}
          </Text>
          {pendingTotal > 0 ? (
            <Text style={[theme.type("caption"), { color: theme.color.status.warning.fg }]}>
              {pendingTotal} transaksi menunggu sinkron di perangkat ini.
            </Text>
          ) : null}
        </View>

        <View
          accessibilityLabel={`${value.length} dari ${PIN_LENGTH} angka terisi`}
          style={{ flexDirection: "row", justifyContent: "center", gap: theme.spacing[12] }}
        >
          {Array.from({ length: PIN_LENGTH }, (_entry, index) => (
            <View
              key={index}
              style={{
                width: theme.spacing[20],
                height: theme.spacing[20],
                borderRadius: theme.radius.full,
                borderWidth: 2,
                borderColor:
                  index < value.length
                    ? theme.color.accent.default
                    : theme.color.border.default,
                backgroundColor:
                  index < value.length ? theme.color.accent.default : "transparent",
              }}
            />
          ))}
        </View>

        {message ? <Notice tone="danger" message={message} /> : null}
        {!message && lastError ? <Notice tone="warning" message={lastError} /> : null}

        <NumericKeypad
          value={value}
          onChange={(next) => {
            const trimmed = next.slice(0, PIN_LENGTH);
            setValue(trimmed);
            if (trimmed.length === PIN_LENGTH) void submit(trimmed);
          }}
          maxDigits={PIN_LENGTH}
        />

        <TextLink
          label="Lupa PIN? Masuk dengan kata sandi"
          onPress={() => {
            void (async () => {
              await forgetDevice();
              router.replace("/masuk");
            })();
          }}
        />
      </View>
    </SafeAreaView>
  );
}
