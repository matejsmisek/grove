/**
 * Base Plugin
 *
 * Provides the settings-backed enablement/configuration behavior that used to
 * live in the PluginRegistry. Each concrete plugin extends this so consumers can
 * depend on the plugin directly (its enabled state, persisted settings and
 * cached availability all come along) without an intermediate registry.
 */
import type { PluginConfig } from '../storage/types.js';
import type { IPlugin, PluginMetadata } from './types.js';

/**
 * Narrow view of the settings service used by plugins to read/write their
 * persisted enablement and plugin-specific settings. `SettingsService`
 * satisfies this structurally.
 */
export interface PluginSettingsStore {
	readSettings(): { plugins?: PluginConfig[] };
	updateSettings(updates: { plugins: PluginConfig[] }): unknown;
}

export abstract class BasePlugin implements IPlugin {
	abstract readonly metadata: PluginMetadata;

	/** Availability is derived from env vars/settings that don't change mid-run, so probe once. */
	private availableCache: boolean | undefined;

	constructor(protected readonly settingsService: PluginSettingsStore) {}

	abstract initialize(): Promise<void>;
	abstract cleanup(): Promise<void>;

	/** Subclasses implement the actual availability probe (e.g. an env-var check). */
	protected abstract checkAvailable(): boolean;

	async isAvailable(): Promise<boolean> {
		if (this.availableCache === undefined) {
			this.availableCache = this.checkAvailable();
		}
		return this.availableCache;
	}

	/** Whether the plugin is enabled in settings. */
	isEnabled(): boolean {
		return this.getConfig()?.enabled ?? false;
	}

	/** Enable the plugin: persist the flag, then initialize it. */
	async enable(): Promise<void> {
		this.persistEnabled(true);
		await this.initialize();
	}

	/** Disable the plugin: persist the flag, then clean it up. */
	async disable(): Promise<void> {
		this.persistEnabled(false);
		await this.cleanup();
	}

	/** Get the plugin's persisted configuration (enabled flag + plugin-specific settings). */
	getConfig(): PluginConfig | undefined {
		const settings = this.settingsService.readSettings();
		return (settings.plugins ?? []).find((p) => p.pluginId === this.metadata.id);
	}

	/** Merge and persist plugin-specific settings. */
	updatePluginSettings(pluginSettings: Record<string, unknown>): void {
		const pluginConfigs = this.settingsService.readSettings().plugins ?? [];
		const existing = pluginConfigs.find((p) => p.pluginId === this.metadata.id);
		if (existing) {
			existing.settings = { ...existing.settings, ...pluginSettings };
		} else {
			pluginConfigs.push({ pluginId: this.metadata.id, enabled: false, settings: pluginSettings });
		}
		this.settingsService.updateSettings({ plugins: pluginConfigs });
	}

	private persistEnabled(enabled: boolean): void {
		const pluginConfigs = this.settingsService.readSettings().plugins ?? [];
		const existing = pluginConfigs.find((p) => p.pluginId === this.metadata.id);
		if (existing) {
			existing.enabled = enabled;
		} else {
			pluginConfigs.push({ pluginId: this.metadata.id, enabled });
		}
		this.settingsService.updateSettings({ plugins: pluginConfigs });
	}
}
