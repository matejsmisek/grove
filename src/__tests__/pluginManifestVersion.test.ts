import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Grove skill ships as a Claude Code plugin whose content is snapshotted
 * per version. If the bundled manifests drift from package.json, published skill
 * updates silently fail to reach users (see scripts/sync-plugin-version.mjs).
 * This guard fails fast on drift; `npm run sync-plugin-version` fixes it.
 */
describe('bundled plugin manifest versions', () => {
	const root = process.cwd();
	const readJson = (rel: string) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

	const pkgVersion = readJson('package.json').version as string;

	it('marketplace.json grove entry matches package.json', () => {
		const marketplace = readJson('.claude-plugin/marketplace.json');
		const grove = marketplace.plugins.find((p: { name: string }) => p.name === 'grove');
		expect(grove.version).toBe(pkgVersion);
	});

	it('plugin.json matches package.json', () => {
		const plugin = readJson('plugins/grove/.claude-plugin/plugin.json');
		expect(plugin.version).toBe(pkgVersion);
	});
});
