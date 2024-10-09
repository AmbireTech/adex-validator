module.exports = {
  root: true,
  env: {
      es2021: true,
      node: true
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  overrides: [
      {
          files: ['scripts/*.js'],
          rules: {
              '@typescript-eslint/no-var-requires': 'off'
          }
      }
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  rules: {
      eqeqeq: 'error',
      '@typescript-eslint/no-unused-vars': 'error'
  }
}
