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
      // A style object with the same key twice silently keeps the LAST one.
      // src/ExercisesView.jsx had `whiteSpace: 'normal', overflowWrap:
      // 'break-word', whiteSpace: 'nowrap'` in one object, so the wrapping it
      // was given never happened and long exercise titles ran across the next
      // column. This config never extended eslint's recommended set, so the
      // core rule that catches it was off.
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off', // many intentional omissions; not gating on it
    },
  },
];
