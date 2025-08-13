export default [
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
      }
    },
    rules: {
      "no-unused-vars": "error",
      "prefer-const": "error"
    }
  }
];
