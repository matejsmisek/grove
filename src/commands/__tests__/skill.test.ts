import { existsSync, rmSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	addMarketplace,
	getInstalledPluginVersion,
	getRegisteredMarketplacePath,
	installPlugin,
	isClaudeCliAvailable,
	isMarketplaceRegistered,
	isPluginInstalled,
	syncPlugin,
	uninstallPlugin,
} from '../../utils/claudePlugin.js';
import { manageSkill } from '../skill.js';

// Mock the Claude plugin wrapper so the tests exercise the orchestration logic
// without touching the real `claude` CLI or filesystem.
vi.mock('../../utils/claudePlugin.js', () => ({
	MARKETPLACE_NAME: 'hypergrove',
	PLUGIN_REF: 'grove@hypergrove',
	addMarketplace: vi.fn(),
	installPlugin: vi.fn(),
	syncPlugin: vi.fn(),
	uninstallPlugin: vi.fn(),
	isClaudeCliAvailable: vi.fn(),
	isMarketplaceRegistered: vi.fn(),
	isPluginInstalled: vi.fn(),
	getInstalledPluginVersion: vi.fn(),
	getRegisteredMarketplacePath: vi.fn(),
}));

vi.mock('../../utils/version.js', () => ({
	getAppVersion: () => '1.3.1',
}));

vi.mock('fs', () => ({
	existsSync: vi.fn(() => false),
	rmSync: vi.fn(),
}));

const OK = { success: true, message: 'ok' };

beforeEach(() => {
	vi.mocked(isClaudeCliAvailable).mockResolvedValue(true);
	vi.mocked(addMarketplace).mockReturnValue({ success: true, message: 'registered' });
	vi.mocked(installPlugin).mockReturnValue(OK);
	vi.mocked(syncPlugin).mockReturnValue(OK);
	vi.mocked(uninstallPlugin).mockReturnValue({ success: true, message: 'uninstalled' });
	vi.mocked(isMarketplaceRegistered).mockReturnValue(true);
	vi.mocked(isPluginInstalled).mockReturnValue(false);
	vi.mocked(getInstalledPluginVersion).mockReturnValue(null);
	vi.mocked(getRegisteredMarketplacePath).mockReturnValue(null);
	vi.mocked(existsSync).mockReturnValue(false);
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('manageSkill', () => {
	describe('install', () => {
		it('fails with a hint when the claude CLI is missing', async () => {
			vi.mocked(isClaudeCliAvailable).mockResolvedValue(false);
			const result = await manageSkill('install');
			expect(result.success).toBe(false);
			expect(result.message).toContain('claude');
			expect(addMarketplace).not.toHaveBeenCalled();
		});

		it('registers the marketplace and installs when not yet installed', async () => {
			vi.mocked(isPluginInstalled).mockReturnValue(false);
			const result = await manageSkill('install');
			expect(addMarketplace).toHaveBeenCalledOnce();
			expect(installPlugin).toHaveBeenCalledOnce();
			expect(syncPlugin).not.toHaveBeenCalled();
			expect(result.success).toBe(true);
			expect(result.details).toContain('Restart Claude Code to load the skill.');
		});

		it('syncs instead of reinstalling when already installed', async () => {
			vi.mocked(isPluginInstalled).mockReturnValue(true);
			await manageSkill('install');
			expect(syncPlugin).toHaveBeenCalledOnce();
			expect(installPlugin).not.toHaveBeenCalled();
		});

		it('returns the marketplace failure without installing', async () => {
			vi.mocked(addMarketplace).mockReturnValue({ success: false, message: 'boom' });
			const result = await manageSkill('install');
			expect(result.success).toBe(false);
			expect(installPlugin).not.toHaveBeenCalled();
		});

		it('removes the legacy skill copy when present', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			const result = await manageSkill('install');
			expect(rmSync).toHaveBeenCalledOnce();
			expect(result.details?.some((d) => d.includes('legacy'))).toBe(true);
		});
	});

	describe('status', () => {
		it('reports not installed', async () => {
			vi.mocked(getInstalledPluginVersion).mockReturnValue(null);
			const result = await manageSkill('status');
			expect(result.message).toContain('not installed');
		});

		it('flags an out-of-date install', async () => {
			vi.mocked(getInstalledPluginVersion).mockReturnValue('1.2.0');
			const result = await manageSkill('status');
			expect(result.details?.some((d) => d.includes('grove skill update'))).toBe(true);
		});

		it('warns when the registered marketplace path is gone', async () => {
			vi.mocked(getInstalledPluginVersion).mockReturnValue('1.3.1');
			vi.mocked(getRegisteredMarketplacePath).mockReturnValue('/gone/path');
			vi.mocked(existsSync).mockReturnValue(false);
			const result = await manageSkill('status');
			expect(result.details?.some((d) => d.includes('no longer exists'))).toBe(true);
		});
	});

	describe('update', () => {
		it('errors when not registered', async () => {
			vi.mocked(isMarketplaceRegistered).mockReturnValue(false);
			const result = await manageSkill('update');
			expect(result.success).toBe(false);
			expect(syncPlugin).not.toHaveBeenCalled();
		});

		it('syncs and appends a restart hint', async () => {
			vi.mocked(isMarketplaceRegistered).mockReturnValue(true);
			const result = await manageSkill('update');
			expect(syncPlugin).toHaveBeenCalledOnce();
			expect(result.details?.some((d) => d.includes('Restart'))).toBe(true);
		});
	});

	describe('uninstall', () => {
		it('delegates to uninstallPlugin', async () => {
			const result = await manageSkill('uninstall');
			expect(uninstallPlugin).toHaveBeenCalledOnce();
			expect(result.success).toBe(true);
		});

		it('fails with a hint when the claude CLI is missing', async () => {
			vi.mocked(isClaudeCliAvailable).mockResolvedValue(false);
			const result = await manageSkill('uninstall');
			expect(result.success).toBe(false);
			expect(uninstallPlugin).not.toHaveBeenCalled();
		});
	});
});
