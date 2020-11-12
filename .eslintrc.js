module.exports = {
  env: {
    // browser: true,
    commonjs: true,
    es6: true,
  },
  extends: ['eslint:recommended', 'airbnb-base', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
    },
  },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2019 },
  plugins: ['@typescript-eslint/eslint-plugin', 'prettier'],
  rules: {
    'operator-linebreak': [0, 'after'],
    'space-before-function-paren': [0],
    'object-curly-newline': ['error', { consistent: true }],
    'max-len': ['error', { code: 120 }],
    'import/extensions': 0,
    'lines-between-class-members': 0,
    'no-unused-vars': 0,
    'no-await-in-loop': 0,
    'no-shadow': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    'prettier/prettier': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-shadow': ['error'],
  },
};
