import fs from 'fs';
import os from 'os';
import path from 'path';

import type { Settings, StorageConfig, WorkspaceContext } from './types.js';

/**
 * Get the storage configuration paths for a specific workspace context
 * @param context - Workspace context (workspace or global)
 */
export function getStorageConfigForContext(context: WorkspaceContext): StorageConfig {
	const groveFolder = context.groveFolder;
	const settingsPath = path.join(groveFolder, 'settings.json');
	const repositoriesPath = path.join(groveFolder, 'repositories.json');
	const grovesIndexPath = path.join(groveFolder, 'groves.json');
	const recentSelectionsPath = path.join(groveFolder, 'recent.json');

	return {
		groveFolder,
		settingsPath,
		repositoriesPath,
		grovesIndexPath,
		recentSelectionsPath,
	};
}

/**
 * Get the storage configuration paths (defaults to global ~/.grove)
 */
export function getStorageConfig(): StorageConfig {
	const homeDir = os.homedir();
	const groveFolder = path.join(homeDir, '.grove');
	const settingsPath = path.join(groveFolder, 'settings.json');
	const repositoriesPath = path.join(groveFolder, 'repositories.json');
	const grovesIndexPath = path.join(groveFolder, 'groves.json');
	const recentSelectionsPath = path.join(groveFolder, 'recent.json');

	return {
		groveFolder,
		settingsPath,
		repositoriesPath,
		grovesIndexPath,
		recentSelectionsPath,
	};
}

/**
 * Get default settings
 */
export function getDefaultSettings(): Settings {
	const homeDir = os.homedir();
	return {
		workingFolder: path.join(homeDir, 'grove-worktrees'),
	};
}

/**
 * Initialize the .grove folder structure if it doesn't exist
 */
export function initializeStorage(): void {
	const config = getStorageConfig();

	// Create .grove folder if it doesn't exist
	if (!fs.existsSync(config.groveFolder)) {
		fs.mkdirSync(config.groveFolder, { recursive: true });
	}

	// Create settings.json if it doesn't exist
	if (!fs.existsSync(config.settingsPath)) {
		const defaultSettings = getDefaultSettings();
		writeSettings(defaultSettings);
	}
}

/**
 * Read settings from settings.json
 */
export function readSettings(): Settings {
	const config = getStorageConfig();

	try {
		if (!fs.existsSync(config.settingsPath)) {
			// If settings file doesn't exist, return defaults and create it
			const defaultSettings = getDefaultSettings();
			writeSettings(defaultSettings);
			return defaultSettings;
		}

		const data = fs.readFileSync(config.settingsPath, 'utf-8');
		const settings = JSON.parse(data) as Settings;

		// Merge with defaults to ensure all required fields exist
		return {
			...getDefaultSettings(),
			...settings,
		};
	} catch (error) {
		// If there's an error reading or parsing, return defaults
		console.error('Error reading settings:', error);
		return getDefaultSettings();
	}
}

/**
 * Write settings to settings.json
 */
export function writeSettings(settings: Settings): void {
	const config = getStorageConfig();

	try {
		// Ensure .grove folder exists
		if (!fs.existsSync(config.groveFolder)) {
			fs.mkdirSync(config.groveFolder, { recursive: true });
		}

		// Write settings with pretty formatting
		const data = JSON.stringify(settings, null, '\t');
		fs.writeFileSync(config.settingsPath, data, 'utf-8');
	} catch (error) {
		console.error('Error writing settings:', error);
		throw error;
	}
}

/**
 * Update specific settings fields
 */
export function updateSettings(updates: Partial<Settings>): Settings {
	const currentSettings = readSettings();
	const newSettings = {
		...currentSettings,
		...updates,
	};
	writeSettings(newSettings);
	return newSettings;
}
