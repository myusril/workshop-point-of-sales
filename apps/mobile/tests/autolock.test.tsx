import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { AutoLock } from "@/src/app/AutoLock";

const lock = jest.fn();
const expireSession = jest.fn();

const mockAuth = {
  status: "signedIn" as const,
  session: {
    user: { id: "u1", name: "Dewi", email: "dewi@example.com", username: "dewi", phone: "", role: "CASHIER" },
    activeOutletId: "11111111-1111-4111-8111-111111111111",
    outlets: [],
    allowedActions: ["create_sale"],
    idleTimeoutMinutes: 2,
    sessionExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    signedInAt: new Date().toISOString(),
    tokenExpiresAt: null,
  },
  hasPin: true,
  lock,
  expireSession,
};

jest.mock("@/src/app/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

describe("auto-lock and absolute expiry (DESIGN §7.7)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-27T02:00:00.000Z"));
    lock.mockClear();
    expireSession.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("locks after the outlet idle timeout", async () => {
    await render(
      <AutoLock>
        <Text>aplikasi</Text>
      </AutoLock>,
    );
    expect(screen.getByText("aplikasi")).toBeOnTheScreen();
    jest.advanceTimersByTime(119_000);
    expect(lock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("expires the session at the server expiry even while unlocked", async () => {
    mockAuth.session.sessionExpiresAt = new Date(
      new Date("2026-11-27T02:00:00.000Z").getTime() + 5 * 60_000,
    ).toISOString();
    await render(
      <AutoLock>
        <Text>aplikasi</Text>
      </AutoLock>,
    );
    jest.advanceTimersByTime(5 * 60_000);
    expect(expireSession).toHaveBeenCalledTimes(1);
  });
});
