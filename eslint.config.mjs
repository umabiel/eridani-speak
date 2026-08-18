// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: ['node_modules/**', 'results/**', 'package-lock.json', 'evals/agentic/repos/**'],
  },
);
