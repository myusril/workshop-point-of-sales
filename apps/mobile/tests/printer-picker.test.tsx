import { fireEvent, render, screen } from "@testing-library/react-native";

import { PrinterPicker } from "@/src/printing/PrinterPicker";
import { ThemeProvider } from "@/src/theme/ThemeProvider";

const printers = [
  { name: "Xprinter XP-58", address: "66:77:88:99:AA:BB" },
  { name: "Rongta RP80", address: "11:22:33:44:55:66" },
];

async function renderPicker(overrides: Partial<React.ComponentProps<typeof PrinterPicker>> = {}) {
  const props: React.ComponentProps<typeof PrinterPicker> = {
    visible: true,
    printers,
    onSelect: jest.fn(),
    onClose: jest.fn(),
    onRefresh: jest.fn(),
    ...overrides,
  };
  await render(
    <ThemeProvider mode="light">
      <PrinterPicker {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe("printer picker", () => {
  it("lists paired printers with an accessible action name", async () => {
    const props = await renderPicker();
    expect(screen.getByRole("header", { name: "Pilih printer" })).toBeVisible();
    expect(screen.getByText("Xprinter XP-58")).toBeVisible();
    await fireEvent.press(screen.getByLabelText("Cetak ke Rongta RP80"));
    expect(props.onSelect).toHaveBeenCalledWith(printers[1]);
  });

  it("shows a searching state without claiming that no printer is paired", async () => {
    await renderPicker({ printers: [], loading: true });
    expect(screen.getAllByText("Mencari printer…").length).toBeGreaterThan(0);
    expect(screen.queryByText("Belum ada printer")).toBeNull();
    expect(screen.queryByText(/Pasangkan printer di Pengaturan/)).toBeNull();
  });

  it("does not show the empty message when discovery failed", async () => {
    await renderPicker({ printers: [], error: "Izin Bluetooth ditolak." });
    expect(screen.getByText("Izin Bluetooth ditolak.")).toBeVisible();
    expect(screen.queryByText("Belum ada printer")).toBeNull();
  });

  it("explains how to pair a printer only for a successful empty result", async () => {
    await renderPicker({ printers: [] });
    expect(screen.getByText("Belum ada printer")).toBeVisible();
    expect(screen.getByText(/Pasangkan printer di Pengaturan Bluetooth Android/)).toBeVisible();
  });

  it("labels an in-flight print as printing, not as a refresh", async () => {
    await renderPicker({ busy: true });
    expect(screen.getByText("Mencetak struk…")).toBeVisible();
    expect(screen.getByText("Mencetak…")).toBeVisible();
    expect(screen.queryByText("Muat ulang")).toBeNull();
  });

  it("closes through the explicit Tutup button", async () => {
    const props = await renderPicker();
    await fireEvent.press(screen.getByLabelText("Tutup"));
    expect(props.onClose).toHaveBeenCalled();
  });
});
