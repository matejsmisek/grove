import fs from 'fs';
import os from 'os';
import path from 'path';

import type { ISettingsService } from '../services/interfaces.js';
import { getStorageConfigForContext } from './storage.js';
import type { Settings, StorageConfig, WorkspaceContext } from './types.js';

/**
 * Service for managing application settings
 * Stores settings in ~/.grove/settings.json (global) or workspace/.grove/settings.json (workspace)
 */
export class SettingsService implements ISettingsService {
	private context?: WorkspaceContext;

	/**
	 * Create a new SettingsService
	 * @param context - Optional workspace context. If provided, uses workspace paths instead of global ~/.grove
	 */
	constructor(context?: WorkspaceContext) {
		this.context = context;
	}

	/**
	 * Get the storage configuration paths
	 */
	getStorageConfig(): StorageConfig {
		if (this.context) {
			return getStorageConfigForContext(this.context);
		}

		// Default to global ~/.grove
		const homeDir = os.homedir();
		const groveFolder = path.join(homeDir, '.grove');
		const settingsPath = path.join(groveFolder, 'settings.json');
		const repositoriesPath = path.join(groveFolder, 'repositories.json');
		const grovesIndexPath = path.join(groveFolder, 'groves.json');
		const recentSelectionsPath = path.join(groveFolder, 'recent.json');
		const sessionsPath = path.join(groveFolder, 'sessions.json');

		return {
			groveFolder,
			settingsPath,
			repositoriesPath,
			grovesIndexPath,
			recentSelectionsPath,
			sessionsPath,
		};
	}

	/**
	 * Get default settings
	 */
	getDefaultSettings(): Settings {
		// If in a workspace context and grovesFolder is set, use that
		if (this.context?.grovesFolder) {
			return {
				workingFolder: this.context.grovesFolder,
			};
		}

		// Default to global ~/grove-worktrees
		const homeDir = os.homedir();
		return {
			workingFolder: path.join(homeDir, 'grove-worktrees'),
		};
	}

	/**
	 * Initialize the .grove folder structure if it doesn't exist
	 */
	initializeStorage(): void {
		const config = this.getStorageConfig();

		// Create .grove folder if it doesn't exist
		if (!fs.existsSync(config.groveFolder)) {
			fs.mkdirSync(config.groveFolder, { recursive: true });
		}

		// Create settings.json if it doesn't exist
		if (!fs.existsSync(config.settingsPath)) {
			const defaultSettings = this.getDefaultSettings();
			this.writeSettings(defaultSettings);
		}
	}

	/**
	 * Read settings from settings.json
	 */
	readSettings(): Settings {
		const config = this.getStorageConfig();

		try {
			if (!fs.existsSync(config.settingsPath)) {
				// If settings file doesn't exist, return defaults and create it
				const defaultSettings = this.getDefaultSettings();
				this.writeSettings(defaultSettings);
				return defaultSettings;
			}

			const data = fs.readFileSync(config.settingsPath, 'utf-8');
			const settings = JSON.parse(data) as Settings;

			// Merge with defaults to ensure all required fields exist
			return {
				...this.getDefaultSettings(),
				...settings,
			};
		} catch (error) {
			// If there's an error reading or parsing, return defaults
			console.error('Error reading settings:', error);
			return this.getDefaultSettings();
		}
	}

	/**
	 * Write settings to settings.json
	 */
	writeSettings(settings: Settings): void {
		const config = this.getStorageConfig();

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
	updateSettings(updates: Partial<Settings>): Settings {
		const currentSettings = this.readSettings();
		const newSettings = {
			...currentSettings,
			...updates,
		};
		this.writeSettings(newSettings);
		return newSettings;
	}
}
