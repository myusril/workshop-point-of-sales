import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["drizzle/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
];
