import { defineConfig } from 'vitest/config';

export default defineConfig({
	esbuild: {
		jsx: 'automatic',
		target: 'es2022',
	},
	test: {
		globals: true,
		environment: 'node',
		coverage: {
			provider: 'c8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'dist/',
				'src/index.tsx',
				'src/navigation/**',
				'**/*.d.ts',
				'**/__tests__/**',
				'**/test/**',
			],
		},
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
	},
});
