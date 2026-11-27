import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, NetworkError } from "@/src/api/client";
import { useAuth } from "@/src/app/AuthProvider";
import { Button } from "@/src/components/ui";
import { Field, Notice, Screen } from "@/src/components/forms";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function MasukScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, message, clearMessage } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    clearMessage();
    setError(null);
    setFieldErrors({});
    if (identifier.trim().length < 3 || password.length === 0) {
      setError("Isi email/nama pengguna dan kata sandi.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(identifier.trim(), password);
      router.replace("/");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors ?? {});
      } else if (caught instanceof NetworkError) {
        setError("Tidak dapat terhubung ke server. Periksa jaringan lalu coba lagi.");
      } else {
        setError(caught instanceof Error ? caught.message : "Masuk gagal. Coba lagi.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg.canvas }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Screen scroll>
          <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[40] }}>
            <Text style={[theme.type("display"), { color: theme.color.text.primary }]}>
              Workshop POS
            </Text>
            <Text style={[theme.type("body.lg"), { color: theme.color.text.secondary }]}>
              Masuk untuk mulai berjualan di konter.
            </Text>
          </View>

          {message ? <Notice tone="warning" message={message} /> : null}
          {error ? <Notice tone="danger" message={error} /> : null}

          <Field
            label="Email, nama pengguna, atau nomor HP"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            autoFocus
            error={fieldErrors.identifier?.[0]}
          />
          <Field
            label="Kata sandi"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={fieldErrors.password?.[0]}
          />
          <Button
            label={submitting ? "Memeriksa…" : "Masuk"}
            onPress={() => void submit()}
            loading={submitting}
          />
          <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
            Aplikasi memerlukan koneksi untuk masuk pertama kali. Setelah itu penjualan tetap
            bisa dilakukan saat offline.
          </Text>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
