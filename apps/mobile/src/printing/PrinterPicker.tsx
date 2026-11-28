import { useEffect, useRef, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Button } from "@/src/components/ui";
import { EmptyState, LoadingState, Notice } from "@/src/components/forms";
import type { PrinterDevice } from "@/src/printing/bluetooth-transport";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Bonded-printer picker for direct ESC/POS printing.
 *
 * Only devices already paired in Android Settings are listed: SPP pairing is
 * an OS responsibility, and silently pairing from the app would hide security
 * prompts. Loading, empty, permission/adapter-error, and printing states are
 * mutually exclusive so the sheet never claims "no printers" while it is still
 * searching or when the real cause is a denied permission.
 */
export function PrinterPicker({
  visible,
  printers,
  loading = false,
  busy = false,
  error,
  onSelect,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  printers: PrinterDevice[];
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  onSelect: (printer: PrinterDevice) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    if (!visible) return;
    const node = findNodeHandle(titleRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [visible]);

  const refreshing = loading || busy;
  const refreshLabel = loading
    ? "Mencari printer…"
    : busy
      ? "Mencetak…"
      : "Muat ulang";
  const showEmpty = !loading && !error && printers.length === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: theme.color.overlay.scrim }}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel="Pilih printer"
          style={{
            backgroundColor: theme.color.bg.surface,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            padding: theme.spacing[16],
            gap: theme.spacing[12],
            maxHeight: "85%",
          }}
        >
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: theme.spacing[12] }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: theme.spacing[4] }}>
              <Text
                ref={titleRef}
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
            {busy ? <LoadingState label="Mencetak struk…" /> : null}
            {loading ? <LoadingState label="Mencari printer…" /> : null}

            {showEmpty ? (
              <EmptyState
                title="Belum ada printer"
                body="Pasangkan printer di Pengaturan Bluetooth Android, lalu muat ulang daftar ini."
              />
            ) : null}

            {!loading && !error && printers.length > 0 ? (
              <View style={{ gap: theme.spacing[8] }}>
                {printers.map((printer) => (
                  <Pressable
                    key={printer.address}
                    accessibilityRole="button"
                    accessibilityLabel={`Cetak ke ${printer.name}`}
                    accessibilityHint={printer.address}
                    accessibilityState={{ disabled: refreshing, busy: refreshing }}
                    disabled={refreshing}
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
                      opacity: refreshing ? 0.55 : 1,
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
              </View>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: theme.spacing[8] }}>
            <Button
              label={refreshLabel}
              variant="secondary"
              onPress={onRefresh}
              loading={refreshing}
              disabled={refreshing}
              style={{ flex: 1 }}
            />
            <Button
              label="Tutup"
              variant="ghost"
              onPress={onClose}
              disabled={refreshing}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
