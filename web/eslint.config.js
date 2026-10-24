import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.js'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '19.2' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Without this, espree flags components that appear only in JSX.
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['tests/**/*.js', 'e2e/**/*.js', 'audit/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // page.evaluate() callbacks run in the browser.
    files: ['audit/**/*.js', 'e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]
