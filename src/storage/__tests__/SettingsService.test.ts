import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanupTempDir, createTempDir } from '../../__tests__/helpers.js';
import { SettingsService } from '../SettingsService.js';
import type { Settings } from '../types.js';

// Mock os.homedir at the module level
let mockHomeDir = '';
vi.mock('os', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import('os');
	return {
		...actual,
		homedir: () => mockHomeDir,
	};
});

describe('SettingsService', () => {
	let service: SettingsService;
	let tempDir: string;
	let mockGroveFolder: string;

	beforeEach(() => {
		tempDir = createTempDir();
		mockGroveFolder = path.join(tempDir, '.grove');

		// Set the mock home directory
		mockHomeDir = tempDir;

		service = new SettingsService();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		cleanupTempDir(tempDir);
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

			expect(defaults.workingFolder).toBe(path.join(tempDir, 'grove-worktrees'));
		});
	});

	describe('initializeStorage', () => {
		it('should create .grove folder if it does not exist', () => {
			service.initializeStorage();

			expect(fs.existsSync(mockGroveFolder)).toBe(true);
		});

		it('should create settings.json with defaults if it does not exist', () => {
			service.initializeStorage();

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			expect(fs.existsSync(settingsPath)).toBe(true);

			const content = fs.readFileSync(settingsPath, 'utf-8');
			const settings = JSON.parse(content);
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
			fs.mkdirSync(mockGroveFolder, { recursive: true });
			fs.writeFileSync(
				path.join(mockGroveFolder, 'settings.json'),
				JSON.stringify({ workingFolder: '/custom/path' }),
			);

			const settings = service.readSettings();

			expect(settings.workingFolder).toBe('/custom/path');
			// Other defaults should be merged in if needed
		});

		it('should return defaults on parse error', () => {
			// Write invalid JSON
			fs.mkdirSync(mockGroveFolder, { recursive: true });
			fs.writeFileSync(path.join(mockGroveFolder, 'settings.json'), 'invalid json {');

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
			expect(fs.existsSync(settingsPath)).toBe(true);

			const content = fs.readFileSync(settingsPath, 'utf-8');
			const parsed = JSON.parse(content);
			expect(parsed.workingFolder).toBe('/test/path');
		});

		it('should create .grove folder if it does not exist', () => {
			const customSettings: Settings = {
				workingFolder: '/test/path',
			};

			service.writeSettings(customSettings);

			expect(fs.existsSync(mockGroveFolder)).toBe(true);
		});

		it('should format JSON with tabs', () => {
			const customSettings: Settings = {
				workingFolder: '/test/path',
			};

			service.writeSettings(customSettings);

			const settingsPath = path.join(mockGroveFolder, 'settings.json');
			const content = fs.readFileSync(settingsPath, 'utf-8');

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
			expect(fs.existsSync(settingsPath)).toBe(true);
		});

		it('should return updated settings', () => {
			service.initializeStorage();

			const updated = service.updateSettings({
				selectedIDE: 'vscode',
			});

			expect(updated.selectedIDE).toBe('vscode');
		});
	});
});
