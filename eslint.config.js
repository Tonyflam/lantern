import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "warn",
      eqeqeq: ["warn", "smart"],
    },
  },
  {
    files: ["src/web/public/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    ignores: [
      "node_modules/**",
      "logs/**",
      "evidence/runs/**",
      "coverage/**",
      "models/**",
    ],
  },
];
