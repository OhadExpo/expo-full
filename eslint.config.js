// Lint gate focused on real bugs, not style. The two form-video upload bugs
// (`demoMode`, `supaUrl`) were undefined-variable references the build can't
// catch — no-undef catches every one. Hook rules catch stale-closure/dep bugs.
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// A code comment written between JSX tags without braces is TEXT: React renders
// it. 4.10: `/* signed in = hollow... */` shipped as words inside every BHBC
// Activity filter button - found by a code review, not by any gate or screenshot.
const noCommentText = {
  meta: { type: 'problem' },
  create(context) {
    return {
      JSXText(node) {
        if (/(^|\s)(\/\*|\/\/)/.test(node.value)) context.report({ node, message: 'A comment between JSX tags renders as text - wrap it: {/* ... */}' });
      },
    };
  },
};

// core no-undef does not see a JSX component name: a bare <Suspense> with no import passed lint (16.10 #826) and would
// have thrown the moment the athlete opened his progress page. A capitalised JSX name must resolve in scope.
const jsxNoUndef = {
  meta: { type: 'problem' },
  create(context) {
    const sc = context.sourceCode || context.getSourceCode();
    return {
      JSXOpeningElement(node) {
        const n = node.name;
        if (!n || n.type !== 'JSXIdentifier' || !/^[A-Z]/.test(n.name)) return;
        let scope = sc.getScope ? sc.getScope(node) : context.getScope();
        while (scope) { if (scope.set && scope.set.has(n.name)) return; scope = scope.upper; }
        if (n.name === 'React') return;
        context.report({ node: n, message: `JSX component '${n.name}' is not defined or imported` });
      },
    };
  },
};

export default [
  {
    files: ['src/**/*.{js,jsx}', 'expo-il/src/**/*.{js,jsx}'],
    ignores: ['**/sw.js', '**/dist/**'],
    // Legacy `// eslint-disable react-hooks/exhaustive-deps` comments are
    // harmless no-ops now that the rule is off — don't report them.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { 'react-hooks': reactHooks, expo: { rules: { 'no-comment-text': noCommentText, 'jsx-no-undef': jsxNoUndef } } },
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
      'expo/no-comment-text': 'error',
      'expo/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off', // many intentional omissions; not gating on it
    },
  },
];
