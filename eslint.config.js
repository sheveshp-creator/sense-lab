import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  // Scripts, tests and config files run in Node, not the browser.
  {
    files: ['scripts/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
