import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Lints the TypeScript MCP servers. chat-ui uses its own `next lint`.
export default tseslint.config(
  {
    ignores: [
      "**/build/**",
      "**/node_modules/**",
      "**/.next/**",
      "chat-ui/**",
      "scripts/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
