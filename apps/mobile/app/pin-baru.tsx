import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/app/AuthProvider";
import { NumericKeypad } from "@/src/components/NumericKeypad";
import { Notice } from "@/src/components/forms";
import { Button } from "@/src/components/ui";
import { PIN_LENGTH } from "@/src/auth/pin";
import { useTheme } from "@/src/theme/ThemeProvider";

type Step = "enter" | "confirm";

export default function PinBaruScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, setPin } = useAuth();
  const [step, setStep] = useState<Step>("enter");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const digits = value.padEnd(PIN_LENGTH, " ").slice(0, PIN_LENGTH);

  async function next() {
    setError(null);
    if (value.length !== PIN_LENGTH) {
      setError(`PIN harus ${PIN_LENGTH} angka.`);
      return;
    }
    if (step === "enter") {
      setFirst(value);
      setValue("");
      setStep("confirm");
      return;
    }
    if (value !== first) {
      setError("PIN tidak sama. Ulangi dari awal.");
      setFirst("");
      setValue("");
      setStep("enter");
      return;
    }
    setSaving(true);
    try {
      await setPin(value);
      router.replace("/");
    } catch {
      setError("PIN tidak dapat disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <View style={{ flex: 1, padding: theme.spacing[16], gap: theme.spacing[16] }}>
        <View style={{ gap: theme.spacing[4] }}>
          <Text style={[theme.type("title.lg"), { color: theme.color.text.primary }]}>
            Buat PIN perangkat
          </Text>
          <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
            {session?.user.name ?? "Pengguna"} · {step === "enter" ? "Masukkan 6 angka." : "Ulangi PIN yang sama."}
          </Text>
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
            PIN ini hanya membuka sesi di perangkat ini dan tidak menggantikan kata sandi akun.
          </Text>
        </View>

        <View
          accessibilityLabel={`${value.length} dari ${PIN_LENGTH} angka terisi`}
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: theme.spacing[12],
            paddingVertical: theme.spacing[16],
          }}
        >
          {digits.split("").map((digit, index) => (
            <View
              key={index}
              style={{
                width: theme.spacing[20],
                height: theme.spacing[20],
                borderRadius: theme.radius.full,
                borderWidth: 2,
                borderColor: digit.trim() ? theme.color.accent.default : theme.color.border.default,
                backgroundColor: digit.trim() ? theme.color.accent.default : "transparent",
              }}
            />
          ))}
        </View>

        {error ? <Notice tone="danger" message={error} /> : null}

        <NumericKeypad
          value={value}
          onChange={(nextValue) => setValue(nextValue.slice(0, PIN_LENGTH))}
          maxDigits={PIN_LENGTH}
          onLimit={() => setError(`PIN maksimal ${PIN_LENGTH} angka.`)}
        />
        <Button
          label={step === "enter" ? "Lanjut" : "Simpan PIN"}
          onPress={() => void next()}
          disabled={value.length !== PIN_LENGTH}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}
