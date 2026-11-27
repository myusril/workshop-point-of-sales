import * as matchers from "@testing-library/react-native/matchers";

expect.extend(matchers);

// lucide-react-native ships ESM; icons are visual only in unit tests.
jest.mock("lucide-react-native", () => {
  const Icon = () => null;
  return new Proxy({}, { get: () => Icon });
});
