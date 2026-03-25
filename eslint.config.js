//import js from "@eslint/js";
//import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/vendors/**"]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    extends: [
      //js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier
    ],
    // languageOptions: {
    //   globals: globals.browser
    // },
    rules: {
      // "@typescript-eslint/no-unused-vars": [
      //   "error",
      //   {
      //     argsIgnorePattern: "^_",
      //     varsIgnorePattern: "^_",
      //     caughtErrorsIgnorePattern: "^_"
      //   }
      // ],
      // "no-unused-vars": "off",
      // "no-undef": "off",
      // "no-case-declarations": "off",
      // "prefer-rest-params": "off",
      // "prefer-const": "off",
      // "no-var": "off",
      // "@typescript-eslint/no-this-alias": "off",
      // "@typescript-eslint/no-unused-expressions": "off"
    }
  }
);
