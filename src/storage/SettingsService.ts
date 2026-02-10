import fs from 'fs';
import os from 'os';
import path from 'path';

import { JsonStore } from './JsonStore.js';
import type { Settings, StorageConfig, WorkspaceContext } from './types.js';

/**
 * Settings service interface
 * Manages application settings stored in ~/.grove/settings.json
 */
export interface ISettingsService {
	/** Get the storage configuration paths */
	getStorageConfig(): StorageConfig;
	/** Get default settings values */
	getDefaultSettings(): Settings;
	/** Initialize the .grove folder structure if it doesn't exist */
	initializeStorage(): void;
	/** Read settings from settings.json */
	readSettings(): Settings;
	/** Write settings to settings.json */
	writeSettings(settings: Settings): void;
	/** Update specific settings fields */
	updateSettings(updates: Partial<Settings>): Settings;
}

/**
 * Service for managing application settings
 * Stores settings in ~/.grove/settings.json (global) or workspace/.grove/settings.json (workspace)
 */
export class SettingsService implements ISettingsService {
	private context?: WorkspaceContext;
	private store: JsonStore<Settings>;

	/**
	 * Create a new SettingsService
	 * @param context - Optional workspace context. If provided, uses workspace paths instead of global ~/.grove
	 */
	constructor(context?: WorkspaceContext) {
		this.context = context;
		this.store = new JsonStore<Settings>(
			() => this.getStorageConfig().settingsPath,
			() => this.getStorageConfig().groveFolder,
			() => this.getDefaultSettings(),
			{
				label: 'settings',
				afterRead: (data, defaults) => ({ ...defaults, ...data }),
			}
		);
	}

	/**
	 * Get the storage configuration paths
	 */
	getStorageConfig(): StorageConfig {
		const groveFolder = this.context ? this.context.groveFolder : path.join(os.homedir(), '.grove');
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
		return this.store.read();
	}

	/**
	 * Write settings to settings.json
	 */
	writeSettings(settings: Settings): void {
		this.store.write(settings);
	}

	/**
	 * Update specific settings fields
	 */
	updateSettings(updates: Partial<Settings>): Settings {
		return this.store.update((current) => ({
			...current,
			...updates,
		}));
	}
}
