import js from "@eslint/js";
import prettier from "eslint-plugin-prettier";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["**/vendor/**"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        CSS: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    plugins: { prettier },
    rules: {
      "no-unused-vars": "error",
      "prefer-const": "error",
      "prettier/prettier": "error",
    },
  },
];
