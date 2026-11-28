import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Button } from "@/src/components/ui";
import { Notice } from "@/src/components/forms";
import type { PrinterDevice } from "@/src/printing/bluetooth-transport";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Bonded-printer picker for direct ESC/POS printing.
 *
 * Only devices already paired in Android Settings are listed: SPP pairing is
 * an OS responsibility, and silently pairing from the app would hide security
 * prompts. Empty and permission states are explicit Bahasa messages.
 */
export function PrinterPicker({
  visible,
  printers,
  busy = false,
  error,
  onSelect,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  printers: PrinterDevice[];
  busy?: boolean;
  error?: string | null;
  onSelect: (printer: PrinterDevice) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.45)" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup pilihan printer"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          style={{
            backgroundColor: theme.color.bg.surface,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            padding: theme.spacing[16],
            gap: theme.spacing[12],
            maxHeight: "75%",
          }}
        >
          <View style={{ gap: theme.spacing[4] }}>
            <Text
              accessibilityRole="header"
              style={[theme.type("title.sm"), { color: theme.color.text.primary }]}
            >
              Pilih printer
            </Text>
            <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
              Printer harus sudah dipasangkan di Pengaturan Bluetooth Android. Ukuran kertas
              58 mm atau 80 mm mengikuti pengaturan outlet.
            </Text>
          </View>

          {error ? <Notice tone="danger" message={error} /> : null}

          {printers.length === 0 ? (
            <Text style={[theme.type("body"), { color: theme.color.text.secondary }]}>
              Belum ada printer yang dipasangkan. Pasangkan printer di Pengaturan Bluetooth
              Android, lalu muat ulang daftar ini.
            </Text>
          ) : (
            <ScrollView contentContainerStyle={{ gap: theme.spacing[8] }}>
              {printers.map((printer) => (
                <Pressable
                  key={printer.address}
                  accessibilityRole="button"
                  accessibilityLabel={`Cetak ke ${printer.name}`}
                  accessibilityHint={printer.address}
                  accessibilityState={{ disabled: busy, busy }}
                  disabled={busy}
                  onPress={() => onSelect(printer)}
                  style={({ pressed }) => ({
                    minHeight: theme.size.targetMobile,
                    paddingHorizontal: theme.spacing[12],
                    paddingVertical: theme.spacing[8],
                    borderRadius: theme.radius.sm,
                    borderWidth: theme.border.width.default,
                    borderColor: theme.color.border.strong,
                    backgroundColor: pressed ? theme.color.bg.hover : theme.color.bg.surface,
                    justifyContent: "center",
                    gap: theme.spacing[4],
                  })}
                >
                  <Text style={[theme.type("body.strong"), { color: theme.color.text.primary }]}>
                    {printer.name}
                  </Text>
                  <Text style={[theme.type("caption"), { color: theme.color.text.muted }]}>
                    {printer.address}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
            <Button
              label={busy ? "Mencetak…" : "Muat ulang"}
              variant="secondary"
              onPress={onRefresh}
              loading={busy}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Button
              label="Tutup"
              variant="ghost"
              onPress={onClose}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
