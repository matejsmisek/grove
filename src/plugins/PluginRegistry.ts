/**
 * Plugin Registry
 * Manages plugin registration, enabling, and disabling
 */
import type { ISettingsService } from '../storage/SettingsService.js';
import type { PluginConfig } from '../storage/types.js';
import type { IPlugin, IPluginRegistry, PluginId } from './types.js';

export class PluginRegistry implements IPluginRegistry {
	private plugins = new Map<PluginId, IPlugin>();
	private initializedPlugins = new Set<PluginId>();

	constructor(private readonly settingsService: ISettingsService) {}

	/**
	 * Register a plugin with the registry
	 */
	register(plugin: IPlugin): void {
		const { id } = plugin.metadata;
		if (this.plugins.has(id)) {
			throw new Error(`Plugin with id '${id}' is already registered`);
		}
		this.plugins.set(id, plugin);
	}

	/**
	 * Get a plugin by ID
	 */
	get(pluginId: PluginId): IPlugin | undefined {
		return this.plugins.get(pluginId);
	}

	/**
	 * Get all registered plugins
	 */
	getAll(): IPlugin[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * Get all enabled plugins
	 */
	async getEnabled(): Promise<IPlugin[]> {
		const enabledPlugins: IPlugin[] = [];
		for (const plugin of this.plugins.values()) {
			if (this.isEnabled(plugin.metadata.id)) {
				const available = await plugin.isAvailable();
				if (available) {
					enabledPlugins.push(plugin);
				}
			}
		}
		return enabledPlugins;
	}

	/**
	 * Check if a plugin is registered
	 */
	has(pluginId: PluginId): boolean {
		return this.plugins.has(pluginId);
	}

	/**
	 * Enable a plugin
	 */
	async enable(pluginId: PluginId): Promise<void> {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			throw new Error(`Plugin '${pluginId}' is not registered`);
		}

		// Update settings
		const settings = this.settingsService.readSettings();
		const pluginConfigs = settings.plugins ?? [];
		const existingConfig = pluginConfigs.find((p) => p.pluginId === pluginId);

		if (existingConfig) {
			existingConfig.enabled = true;
		} else {
			pluginConfigs.push({ pluginId, enabled: true });
		}

		this.settingsService.updateSettings({ plugins: pluginConfigs });

		// Initialize plugin if not already initialized
		if (!this.initializedPlugins.has(pluginId)) {
			await plugin.initialize();
			this.initializedPlugins.add(pluginId);
		}
	}

	/**
	 * Disable a plugin
	 */
	async disable(pluginId: PluginId): Promise<void> {
		const plugin = this.plugins.get(pluginId);
		if (!plugin) {
			throw new Error(`Plugin '${pluginId}' is not registered`);
		}

		// Update settings
		const settings = this.settingsService.readSettings();
		const pluginConfigs = settings.plugins ?? [];
		const existingConfig = pluginConfigs.find((p) => p.pluginId === pluginId);

		if (existingConfig) {
			existingConfig.enabled = false;
			this.settingsService.updateSettings({ plugins: pluginConfigs });
		}

		// Cleanup plugin if initialized
		if (this.initializedPlugins.has(pluginId)) {
			await plugin.cleanup();
			this.initializedPlugins.delete(pluginId);
		}
	}

	/**
	 * Check if a plugin is enabled in settings
	 */
	isEnabled(pluginId: PluginId): boolean {
		const settings = this.settingsService.readSettings();
		const pluginConfigs = settings.plugins ?? [];
		const config = pluginConfigs.find((p) => p.pluginId === pluginId);
		return config?.enabled ?? false;
	}

	/**
	 * Get plugin configuration from settings
	 */
	getPluginConfig(pluginId: PluginId): PluginConfig | undefined {
		const settings = this.settingsService.readSettings();
		const pluginConfigs = settings.plugins ?? [];
		return pluginConfigs.find((p) => p.pluginId === pluginId);
	}

	/**
	 * Update plugin-specific settings
	 */
	updatePluginSettings(pluginId: PluginId, pluginSettings: Record<string, unknown>): void {
		const settings = this.settingsService.readSettings();
		const pluginConfigs = settings.plugins ?? [];
		const existingConfig = pluginConfigs.find((p) => p.pluginId === pluginId);

		if (existingConfig) {
			existingConfig.settings = { ...existingConfig.settings, ...pluginSettings };
		} else {
			pluginConfigs.push({ pluginId, enabled: false, settings: pluginSettings });
		}

		this.settingsService.updateSettings({ plugins: pluginConfigs });
	}

	/**
	 * Initialize all enabled plugins
	 */
	async initializeEnabled(): Promise<void> {
		for (const plugin of this.plugins.values()) {
			const pluginId = plugin.metadata.id;
			if (this.isEnabled(pluginId) && !this.initializedPlugins.has(pluginId)) {
				const available = await plugin.isAvailable();
				if (available) {
					await plugin.initialize();
					this.initializedPlugins.add(pluginId);
				}
			}
		}
	}

	/**
	 * Cleanup all initialized plugins
	 */
	async cleanupAll(): Promise<void> {
		for (const pluginId of this.initializedPlugins) {
			const plugin = this.plugins.get(pluginId);
			if (plugin) {
				await plugin.cleanup();
			}
		}
		this.initializedPlugins.clear();
	}
}
