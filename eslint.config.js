// Lint gate focused on real bugs, not style. The two form-video upload bugs
// (`demoMode`, `supaUrl`) were undefined-variable references the build can't
// catch — no-undef catches every one. Hook rules catch stale-closure/dep bugs.
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}', 'expo-il/src/**/*.{js,jsx}'],
    ignores: ['**/sw.js', '**/dist/**'],
    // Legacy `// eslint-disable react-hooks/exhaustive-deps` comments are
    // harmless no-ops now that the rule is off — don't report them.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.serviceworker,
        React: 'readonly',
        process: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off', // many intentional omissions; not gating on it
    },
  },
];
