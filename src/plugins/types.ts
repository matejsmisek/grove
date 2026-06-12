/**
 * Plugin System Types
 * Defines the interface for Grove plugins
 */

/**
 * Plugin identifier - unique string identifier for each plugin
 */
export type PluginId = string;

/**
 * Plugin status
 */
export type PluginStatus = 'enabled' | 'disabled' | 'error';

/**
 * Plugin metadata
 */
export interface PluginMetadata {
	/** Unique plugin identifier */
	id: PluginId;
	/** Human-readable plugin name */
	name: string;
	/** Plugin description */
	description: string;
	/** Plugin version */
	version: string;
}

/**
 * Base plugin interface
 * All plugins must implement this interface
 */
export interface IPlugin {
	/** Plugin metadata */
	readonly metadata: PluginMetadata;

	/**
	 * Initialize the plugin
	 * Called when the plugin is enabled
	 */
	initialize(): Promise<void>;

	/**
	 * Cleanup the plugin
	 * Called when the plugin is disabled or app shuts down
	 */
	cleanup(): Promise<void>;

	/**
	 * Check if the plugin is available/configured
	 * Returns false if required configuration is missing
	 */
	isAvailable(): Promise<boolean>;
}
