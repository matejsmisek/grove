import fs from 'fs';
import os from 'os';
import path from 'path';

import { getGlobalGroveFolder } from '../utils/globalGroveDir.js';
import { JsonStore } from './JsonStore.js';
import type { Settings, StorageConfig, WorkspaceContext } from './types.js';

/**
 * Settings service interface
 * Manages application settings stored in ~/.grove/settings.json
 */
export interface ISettingsService {
	/** Get the storage configuration paths */
	getStorageConfig(): StorageConfig;
	/** Switch the active workspace context (re-points all storage paths) */
	setContext(context: WorkspaceContext | undefined): void;
	/** Get default settings values */
	getDefaultSettings(): Settings;
	/** Whether a settings.json file already exists on disk (used to detect first run) */
	hasSettingsFile(): boolean;
	/** Initialize the .grove folder structure if it doesn't exist */
	initializeStorage(): void;
	/** Read settings from settings.json */
	readSettings(): Settings;
	/** Write settings to settings.json */
	writeSettings(settings: Settings): void;
	/** Update specific settings fields */
	updateSettings(updates: Partial<Settings>): Settings;
	/**
	 * Whether mouse control is enabled. Always read from the GLOBAL settings
	 * file, regardless of the active workspace context. Defaults to true.
	 */
	getMouseControlEnabled(): boolean;
	/**
	 * Enable/disable mouse control. Always written to the GLOBAL settings file,
	 * so it cannot be overridden per-workspace.
	 */
	setMouseControlEnabled(enabled: boolean): void;
}

/**
 * Service for managing application settings
 * Stores settings in ~/.grove/settings.json (global) or workspace/.grove/settings.json (workspace)
 */
export class SettingsService implements ISettingsService {
	private context?: WorkspaceContext;
	private store: JsonStore<Settings>;
	/**
	 * Store bound to the GLOBAL settings file regardless of context. Used for
	 * settings that must never be overridden per-workspace (e.g. mouse control).
	 */
	private globalStore: JsonStore<Settings>;

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
		this.globalStore = new JsonStore<Settings>(
			() => path.join(getGlobalGroveFolder(), 'settings.json'),
			() => getGlobalGroveFolder(),
			() => ({ workingFolder: path.join(os.homedir(), 'grove-worktrees') }),
			{
				label: 'settings',
				afterRead: (data, defaults) => ({ ...defaults, ...data }),
			}
		);
	}

	/**
	 * Switch the active workspace context. Because all storage paths are derived
	 * from the context on each access, this re-points settings, repositories,
	 * groves, recent, and sessions storage to the new context's .grove folder.
	 */
	setContext(context: WorkspaceContext | undefined): void {
		this.context = context;
	}

	/**
	 * Get the storage configuration paths
	 */
	getStorageConfig(): StorageConfig {
		const groveFolder = this.context ? this.context.groveFolder : getGlobalGroveFolder();
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
	 * Whether a settings.json file already exists on disk.
	 * Used to detect a first run (no settings yet) before storage is initialized.
	 */
	hasSettingsFile(): boolean {
		return fs.existsSync(this.getStorageConfig().settingsPath);
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

	/**
	 * Whether mouse control is enabled. Read from the GLOBAL settings file so
	 * the value is shared across all workspaces. Defaults to true when unset.
	 */
	getMouseControlEnabled(): boolean {
		return this.globalStore.read().mouseControlEnabled ?? true;
	}

	/**
	 * Enable/disable mouse control, persisting to the GLOBAL settings file.
	 */
	setMouseControlEnabled(enabled: boolean): void {
		this.globalStore.update((current) => ({
			...current,
			mouseControlEnabled: enabled,
		}));
	}
}
