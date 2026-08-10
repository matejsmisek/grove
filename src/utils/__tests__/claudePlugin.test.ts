import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	addMarketplace,
	getInstalledPluginVersion,
	getRegisteredMarketplacePath,
	installPlugin,
	isMarketplaceRegistered,
	isPluginInstalled,
	syncPlugin,
} from '../claudePlugin.js';
import { findPackageRoot } from '../version.js';

vi.mock('fs', () => ({ readFileSync: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync: vi.fn(), spawn: vi.fn() }));
vi.mock('../version.js', () => ({ findPackageRoot: vi.fn(() => '/pkg') }));
vi.mock('../commandExists.js', () => ({ commandExists: vi.fn() }));

const CONFIG_DIR = '/cfg';

/** Route readFileSync to canned JSON keyed by filename suffix. */
function mockConfigFiles(files: Record<string, unknown>) {
	vi.mocked(readFileSync).mockImplementation((p: unknown) => {
		const pathStr = String(p);
		for (const [suffix, value] of Object.entries(files)) {
			if (pathStr.endsWith(suffix)) {
				return JSON.stringify(value);
			}
		}
		throw new Error(`ENOENT: ${pathStr}`);
	});
}

beforeEach(() => {
	process.env.CLAUDE_CONFIG_DIR = CONFIG_DIR;
	vi.mocked(findPackageRoot).mockReturnValue('/pkg');
	vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as never);
});

afterEach(() => {
	delete process.env.CLAUDE_CONFIG_DIR;
	vi.clearAllMocks();
});

describe('getInstalledPluginVersion', () => {
	it('returns the user-scope version', () => {
		mockConfigFiles({
			'installed_plugins.json': {
				plugins: { 'grove@hypergrove': [{ scope: 'user', version: '1.2.0' }] },
			},
		});
		expect(getInstalledPluginVersion()).toBe('1.2.0');
		expect(isPluginInstalled()).toBe(true);
	});

	it('prefers the user-scope entry over others', () => {
		mockConfigFiles({
			'installed_plugins.json': {
				plugins: {
					'grove@hypergrove': [
						{ scope: 'project', version: '1.0.0' },
						{ scope: 'user', version: '1.3.1' },
					],
				},
			},
		});
		expect(getInstalledPluginVersion()).toBe('1.3.1');
	});

	it('returns null when not installed or the file is missing', () => {
		mockConfigFiles({});
		expect(getInstalledPluginVersion()).toBeNull();
		expect(isPluginInstalled()).toBe(false);
	});
});

describe('marketplace registration', () => {
	it('reads the install location from known_marketplaces.json', () => {
		mockConfigFiles({ 'known_marketplaces.json': { hypergrove: { installLocation: '/pkg' } } });
		expect(getRegisteredMarketplacePath()).toBe('/pkg');
		expect(isMarketplaceRegistered()).toBe(true);
	});

	it('returns null when the marketplace is absent', () => {
		mockConfigFiles({ 'known_marketplaces.json': { other: { installLocation: '/x' } } });
		expect(getRegisteredMarketplacePath()).toBeNull();
		expect(isMarketplaceRegistered()).toBe(false);
	});
});

describe('addMarketplace', () => {
	it('is a no-op when already registered', () => {
		mockConfigFiles({ 'known_marketplaces.json': { hypergrove: { installLocation: '/pkg' } } });
		const result = addMarketplace();
		expect(result.success).toBe(true);
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it('fails when the package root cannot be located', () => {
		mockConfigFiles({});
		vi.mocked(findPackageRoot).mockReturnValue(null);
		const result = addMarketplace();
		expect(result.success).toBe(false);
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it('runs `claude plugin marketplace add` at user scope', () => {
		mockConfigFiles({});
		const result = addMarketplace();
		expect(result.success).toBe(true);
		expect(spawnSync).toHaveBeenCalledWith(
			'claude',
			['plugin', 'marketplace', 'add', '/pkg', '--scope', 'user'],
			expect.anything()
		);
	});
});

describe('plugin CLI wrappers', () => {
	it('installPlugin succeeds on exit code 0', () => {
		mockConfigFiles({});
		expect(installPlugin().success).toBe(true);
	});

	it('installPlugin fails and surfaces stderr on non-zero exit', () => {
		mockConfigFiles({});
		vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: 'nope' } as never);
		const result = installPlugin();
		expect(result.success).toBe(false);
		expect(result.details).toContain('nope');
	});

	it('syncPlugin stops when the marketplace refresh fails', () => {
		mockConfigFiles({});
		vi
			.mocked(spawnSync)
			.mockReturnValueOnce({ status: 1, stdout: '', stderr: 'refresh failed' } as never);
		const result = syncPlugin();
		expect(result.success).toBe(false);
		// Only the refresh ran; the plugin update was not attempted.
		expect(spawnSync).toHaveBeenCalledTimes(1);
	});
});
