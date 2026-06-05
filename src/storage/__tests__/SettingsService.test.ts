import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { SettingsService } from '../SettingsService.js';
import type { Settings } from '../types.js';

// Mock filesystem and os modules
let vol: Volume;
let mockHomeDir: string;

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

vi.mock('os', () => ({
	default: {
		homedir: () => mockHomeDir,
	},
	homedir: () => mockHomeDir,
}));

describe('SettingsService', () => {
	let service: SettingsService;
	let mockGroveFolder: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		// Setup mock home directory
		mockHomeDir = '/home/testuser';
		setupMockHomeDir(vol, mockHomeDir);
		mockGroveFolder = path.join(mockHomeDir, '.grove');

		service = new SettingsService();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getStorageConfig', () => {
		it('should return correct storage paths', () => {
			const config = service.getStorageConfig();

			expect(config.groveFolder).toBe(mockGroveFolder);
			expect(config.settingsPath).toBe(path.join(mockGroveFolder, 'settings.json'));
			expect(config.repositoriesPath).toBe(path.join(mockGroveFolder, 'repositories.json'));
			expect(config.grovesIndexPath).toBe(path.join(mockGroveFolder, 'groves.json'));
			expect(config.recentSelectionsPath).toBe(path.join(mockGroveFolder, 'recent.json'));
		});
	});

	describe('getDefaultSettings', () => {
		it('should return default settings with correct workingFolder', () => {
			const defaults = service.getDefaultSettings();

			expect(defaults.workingFolder).toBe(path.join(mockHomeDir, 'grove-worktrees'));
		});
	});

	describe('hasSettingsFile', () => {
		it('should return false when settings.json does not exist', () => {
			expect(service.hasSettingsFile()).toBe(false);
		});

		it('should return true after settings.json is created', () => {
			service.initializeStorage();
			expect(service.hasSettingsFile()).toBe(true);
		});
	});

	describe('initializeStorage', () => {
		it('should create .grove folder if it does not exist', () => {
			// Remove the folder first
			vol.rmdirSync(mockGroveFolder);

			service.initializeStorage();

			expect(vol.existsSync(mockGroveFolder)).toBe(true);
		});

		it('should create settings.json with defaults if it does not exist', () => {
			service.initializeStorage();

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			expect(vol.existsSync(settingsPath)).toBe(true);

			const content = vol.readFileSync(settingsPath, 'utf-8');
			const settings = JSON.parse(content as string);
			expect(settings).toHaveProperty('workingFolder');
		});

		it('should not overwrite existing settings.json', () => {
			// Initialize first time
			service.initializeStorage();

			// Modify settings
			const customSettings: Settings = {
				workingFolder: '/custom/path',
			};
			service.writeSettings(customSettings);

			// Initialize again
			service.initializeStorage();

			// Settings should still be custom
			const settings = service.readSettings();
			expect(settings.workingFolder).toBe('/custom/path');
		});
	});

	describe('readSettings', () => {
		it('should return default settings if file does not exist', () => {
			const settings = service.readSettings();

			expect(settings).toEqual(service.getDefaultSettings());
		});

		it('should read settings from file', () => {
			const customSettings: Settings = {
				workingFolder: '/custom/path',
				terminal: {
					command: 'gnome-terminal',
					args: ['--working-directory={{path}}'],
				},
			};

			service.writeSettings(customSettings);
			const settings = service.readSettings();

			expect(settings.workingFolder).toBe('/custom/path');
			expect(settings.terminal?.command).toBe('gnome-terminal');
		});

		it('should merge with defaults for missing fields', () => {
			// Write partial settings
			vol.writeFileSync(
				path.join(mockGroveFolder, 'settings.json'),
				JSON.stringify({ workingFolder: '/custom/path' })
			);

			const settings = service.readSettings();

			expect(settings.workingFolder).toBe('/custom/path');
		});

		it('should return defaults on parse error', () => {
			// Write invalid JSON
			vol.writeFileSync(path.join(mockGroveFolder, 'settings.json'), 'invalid json {');

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const settings = service.readSettings();

			expect(settings).toEqual(service.getDefaultSettings());
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('writeSettings', () => {
		it('should write settings to file', () => {
			const customSettings: Settings = {
				workingFolder: '/test/path',
			};

			service.writeSettings(customSettings);

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			expect(vol.existsSync(settingsPath)).toBe(true);

			const content = vol.readFileSync(settingsPath, 'utf-8');
			const parsed = JSON.parse(content as string);
			expect(parsed.workingFolder).toBe('/test/path');
		});

		it('should create .grove folder if it does not exist', () => {
			// Remove the folder
			vol.rmdirSync(mockGroveFolder);

			const customSettings: Settings = {
				workingFolder: '/test/path',
			};

			service.writeSettings(customSettings);

			expect(vol.existsSync(mockGroveFolder)).toBe(true);
		});

		it('should format JSON with tabs', () => {
			const customSettings: Settings = {
				workingFolder: '/test/path',
			};

			service.writeSettings(customSettings);

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			const content = vol.readFileSync(settingsPath, 'utf-8') as string;

			// Should contain tabs (formatted JSON)
			expect(content).toContain('\t');
		});
	});

	describe('updateSettings', () => {
		it('should update specific fields without overwriting others', () => {
			const initialSettings: Settings = {
				workingFolder: '/initial/path',
				terminal: {
					command: 'gnome-terminal',
					args: [],
				},
			};

			service.writeSettings(initialSettings);

			const updated = service.updateSettings({
				workingFolder: '/updated/path',
			});

			expect(updated.workingFolder).toBe('/updated/path');
			expect(updated.terminal?.command).toBe('gnome-terminal');
		});

		it('should create settings file if it does not exist', () => {
			const updated = service.updateSettings({
				workingFolder: '/new/path',
			});

			expect(updated.workingFolder).toBe('/new/path');

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			expect(vol.existsSync(settingsPath)).toBe(true);
		});

		it('should return updated settings', () => {
			service.initializeStorage();

			const updated = service.updateSettings({
				selectedIDE: 'vscode',
			});

			expect(updated.selectedIDE).toBe('vscode');
		});
	});

	describe('inheritance (global -> workspace/repo)', () => {
		const workspaceGroveFolder = '/workspace/project/.grove';
		const workspaceGrovesFolder = '/workspace/project/groves';

		const createWorkspaceService = () =>
			new SettingsService({
				type: 'workspace',
				groveFolder: workspaceGroveFolder,
				grovesFolder: workspaceGrovesFolder,
			});

		const writeGlobalSettings = (settings: Partial<Settings>) => {
			vol.writeFileSync(
				path.join(mockGroveFolder, 'settings.json'),
				JSON.stringify({ workingFolder: path.join(mockHomeDir, 'grove-worktrees'), ...settings })
			);
		};

		it('should inherit unset keys from the global settings file', () => {
			writeGlobalSettings({
				selectedIDE: 'phpstorm',
				terminal: { command: 'gnome-terminal', args: [] },
			});

			const workspaceService = createWorkspaceService();
			const settings = workspaceService.readSettings();

			// Inherited from global
			expect(settings.selectedIDE).toBe('phpstorm');
			expect(settings.terminal?.command).toBe('gnome-terminal');
			// Context-specific working folder, not the global one
			expect(settings.workingFolder).toBe(workspaceGrovesFolder);
		});

		it('should let the workspace override individual keys', () => {
			writeGlobalSettings({ selectedIDE: 'phpstorm' });

			const workspaceService = createWorkspaceService();
			workspaceService.updateSettings({ selectedIDE: 'vscode' });

			expect(workspaceService.readSettings().selectedIDE).toBe('vscode');

			// Global value is untouched
			const globalStored = JSON.parse(
				vol.readFileSync(path.join(mockGroveFolder, 'settings.json'), 'utf-8') as string
			) as Settings;
			expect(globalStored.selectedIDE).toBe('phpstorm');
		});

		it('should keep the workspace settings file sparse (no baked-in global keys)', () => {
			writeGlobalSettings({
				selectedIDE: 'phpstorm',
				terminal: { command: 'gnome-terminal', args: [] },
			});

			const workspaceService = createWorkspaceService();
			workspaceService.updateSettings({ selectedIDE: 'vscode' });

			const workspaceStored = JSON.parse(
				vol.readFileSync(path.join(workspaceGroveFolder, 'settings.json'), 'utf-8') as string
			) as Settings;

			// Only the working folder default and the explicit override are persisted
			expect(workspaceStored.selectedIDE).toBe('vscode');
			expect(workspaceStored.terminal).toBeUndefined();
			expect(Object.keys(workspaceStored).sort()).toEqual(['selectedIDE', 'workingFolder']);
		});

		it('should propagate later global changes to non-overridden keys', () => {
			writeGlobalSettings({ selectedIDE: 'phpstorm' });

			const workspaceService = createWorkspaceService();
			// Workspace overrides something unrelated, leaving terminal unset
			workspaceService.updateSettings({ workingFolder: '/workspace/custom' });

			// Global terminal is added afterwards
			writeGlobalSettings({ selectedIDE: 'phpstorm', terminal: { command: 'kitty', args: [] } });

			expect(workspaceService.readSettings().terminal?.command).toBe('kitty');
		});

		it('should read the global file directly in the global context', () => {
			writeGlobalSettings({ selectedIDE: 'phpstorm' });

			expect(service.readSettings().selectedIDE).toBe('phpstorm');
		});
	});

	describe('mouse control (global-only setting)', () => {
		it('should default to true when unset', () => {
			expect(service.getMouseControlEnabled()).toBe(true);
		});

		it('should persist the value to the global settings file', () => {
			service.setMouseControlEnabled(false);

			expect(service.getMouseControlEnabled()).toBe(false);

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			const stored = JSON.parse(vol.readFileSync(settingsPath, 'utf-8') as string) as Settings;
			expect(stored.mouseControlEnabled).toBe(false);
		});

		it('should round-trip an explicit true value', () => {
			service.setMouseControlEnabled(false);
			service.setMouseControlEnabled(true);

			expect(service.getMouseControlEnabled()).toBe(true);
		});

		it('should read/write the GLOBAL file regardless of workspace context', () => {
			// Service bound to a workspace context whose .grove folder differs
			// from the global ~/.grove folder.
			const workspaceGroveFolder = '/workspace/project/.grove';
			const workspaceService = new SettingsService({
				type: 'workspace',
				groveFolder: workspaceGroveFolder,
			});

			workspaceService.setMouseControlEnabled(false);

			// The value lands in the GLOBAL file, not the workspace one.
			const globalSettingsPath = path.join(mockGroveFolder, 'settings.json');
			const globalStored = JSON.parse(
				vol.readFileSync(globalSettingsPath, 'utf-8') as string
			) as Settings;
			expect(globalStored.mouseControlEnabled).toBe(false);

			// The workspace settings file does not carry the mouse control flag.
			const workspaceSettingsPath = path.join(workspaceGroveFolder, 'settings.json');
			if (vol.existsSync(workspaceSettingsPath)) {
				const workspaceStored = JSON.parse(
					vol.readFileSync(workspaceSettingsPath, 'utf-8') as string
				) as Settings;
				expect(workspaceStored.mouseControlEnabled).toBeUndefined();
			}

			// A fresh global service sees the same value.
			expect(new SettingsService().getMouseControlEnabled()).toBe(false);
		});
	});
});
