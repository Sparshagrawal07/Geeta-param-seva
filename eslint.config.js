// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.size-report/*', 'src/generated/*'],
  },
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'],
        },
      },
    },
    rules: {
      // expo-image ships a TypeScript `main`; keep the import while Node resolution settles.
      'import/no-unresolved': [
        'error',
        {
          ignore: ['^expo-image$', '^expo-sqlite$', '^@react-native-community/netinfo$'],
        },
      ],
      // Standard RN data-loading effects trip the React Compiler purity rules.
      // Keep them as warnings so CI can still gate real correctness errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
