import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'src/vendors/**'],
    },
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier],
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            // "no-unused-vars": "off",
            // "no-undef": "off",
            // "no-case-declarations": "off",
            // "prefer-rest-params": "off",
            // "prefer-const": "off",
            // "no-var": "off",
            // "@typescript-eslint/no-this-alias": "off",
            // "@typescript-eslint/no-unused-expressions": "off"
        },
    },
    {
        files: ['**/*.vue'],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
            pluginVue.configs['flat/recommended'],
            eslintConfigPrettier,
        ],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'vue/multi-word-component-names': 'off',
            'vue/attributes-order': 'error',
        },
    }
);
