import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectMonorepoSync, getRepoProjectsSync } from '../monorepo.js';

// Mock filesystem (mirrors the pattern used in service tests)
let vol: Volume;

vi.mock('fs', () => {
	return {
		default: new Proxy(
			{},
			{
				get(_target, prop) {
					return vol?.[prop as keyof Volume];
				},
			}
		),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter((key) => key !== 'constructor')
				.map((key) => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

describe('getRepoProjectsSync / detectMonorepoSync', () => {
	beforeEach(() => {
		vol = new Volume();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('treats a single project at the root as NOT a monorepo', () => {
		vol.mkdirSync('/repo/src', { recursive: true });
		vol.writeFileSync('/repo/package.json', '{}');
		vol.writeFileSync('/repo/src/index.ts', '');
		vol.mkdirSync('/repo/tests', { recursive: true });
		vol.mkdirSync('/repo/docs', { recursive: true });

		expect(getRepoProjectsSync('/repo')).toEqual([]);
		expect(detectMonorepoSync('/repo')).toBe(false);
	});

	it('detects multiple top-level project folders', () => {
		vol.mkdirSync('/repo/frontend', { recursive: true });
		vol.writeFileSync('/repo/frontend/package.json', '{}');
		vol.mkdirSync('/repo/backend', { recursive: true });
		vol.writeFileSync('/repo/backend/composer.json', '{}');

		expect(getRepoProjectsSync('/repo')).toEqual(['backend', 'frontend']);
		expect(detectMonorepoSync('/repo')).toBe(true);
	});

	it('descends into container directories (packages/*)', () => {
		vol.mkdirSync('/repo/packages/core', { recursive: true });
		vol.writeFileSync('/repo/packages/core/package.json', '{}');
		vol.mkdirSync('/repo/packages/ui', { recursive: true });
		vol.writeFileSync('/repo/packages/ui/package.json', '{}');
		// Root manifest declaring workspaces is common and should not change the result
		vol.writeFileSync('/repo/package.json', '{"workspaces":["packages/*"]}');

		expect(getRepoProjectsSync('/repo')).toEqual(['packages/core', 'packages/ui']);
		expect(detectMonorepoSync('/repo')).toBe(true);
	});

	it('recognizes python projects via .py files and src directories', () => {
		vol.mkdirSync('/repo/service_a', { recursive: true });
		vol.writeFileSync('/repo/service_a/main.py', '');
		vol.mkdirSync('/repo/service_b/src', { recursive: true });

		expect(getRepoProjectsSync('/repo')).toEqual(['service_a', 'service_b']);
		expect(detectMonorepoSync('/repo')).toBe(true);
	});

	it('ignores node_modules, hidden, and build directories', () => {
		vol.mkdirSync('/repo/node_modules/foo', { recursive: true });
		vol.writeFileSync('/repo/node_modules/foo/package.json', '{}');
		vol.mkdirSync('/repo/.husky', { recursive: true });
		vol.writeFileSync('/repo/.husky/package.json', '{}');
		vol.mkdirSync('/repo/dist', { recursive: true });
		vol.writeFileSync('/repo/dist/package.json', '{}');
		// Only one real project
		vol.mkdirSync('/repo/app', { recursive: true });
		vol.writeFileSync('/repo/app/package.json', '{}');

		expect(getRepoProjectsSync('/repo')).toEqual(['app']);
		expect(detectMonorepoSync('/repo')).toBe(false);
	});

	it('returns an empty list for a repo with no project folders', () => {
		vol.mkdirSync('/repo/docs', { recursive: true });
		vol.mkdirSync('/repo/assets', { recursive: true });

		expect(getRepoProjectsSync('/repo')).toEqual([]);
		expect(detectMonorepoSync('/repo')).toBe(false);
	});
});
