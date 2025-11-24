/**
 * Settings Service Implementation
 * Wraps storage.ts functions in a class for DI compatibility
 */
import type { ISettingsService } from '../services/interfaces.js';
import {
	getDefaultSettings,
	getStorageConfig,
	initializeStorage,
	readSettings,
	updateSettings,
	writeSettings,
} from './storage.js';
import type { Settings, StorageConfig } from './types.js';

/**
 * Settings service implementation
 * Manages application settings stored in ~/.grove/settings.json
 */
export class SettingsService implements ISettingsService {
	/**
	 * Get the storage configuration paths
	 */
	getStorageConfig(): StorageConfig {
		return getStorageConfig();
	}

	/**
	 * Get default settings values
	 */
	getDefaultSettings(): Settings {
		return getDefaultSettings();
	}

	/**
	 * Initialize the .grove folder structure if it doesn't exist
	 */
	initializeStorage(): void {
		initializeStorage();
	}

	/**
	 * Read settings from settings.json
	 */
	readSettings(): Settings {
		return readSettings();
	}

	/**
	 * Write settings to settings.json
	 */
	writeSettings(settings: Settings): void {
		writeSettings(settings);
	}

	/**
	 * Update specific settings fields
	 */
	updateSettings(updates: Partial<Settings>): Settings {
		return updateSettings(updates);
	}
}
