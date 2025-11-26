import js from "@eslint/js";

// Minimal flat config. TypeScript files are currently ignored because the project
// does not include a TypeScript ESLint parser; add @typescript-eslint/parser/plugin
// to enable TS linting.
export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Placeholder to keep ESLint from attempting to parse TS without a TS parser.
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.{ts,tsx}"],
  },
];
