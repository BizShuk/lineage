import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/{unit,content,integration}/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
