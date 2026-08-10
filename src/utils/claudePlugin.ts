import { spawn, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { commandExists } from './commandExists.js';
import { findPackageRoot } from './version.js';

/**
 * Distribution of the Grove skill as a Claude Code plugin.
 *
 * Grove bundles a Claude Code marketplace + plugin inside its own npm package
 * (`<pkg>/.claude-plugin/marketplace.json` and `<pkg>/plugins/grove`). Installing
 * the skill means registering that directory as a user-scope marketplace and
 * installing the plugin from it — Claude then owns the enable/update lifecycle.
 *
 * Sync model (verified against Claude Code 2.1.x): a `directory`-source
 * marketplace is referenced live from the package dir (no clone), but plugin
 * *content* is snapshotted per version into
 * `<config>/plugins/cache/<marketplace>/<plugin>/<version>/`. A version bump is
 * therefore required for `claude plugin update` to pick up new content — which is
 * exactly why the bundled manifests are version-locked to package.json (see
 * scripts/sync-plugin-version.mjs).
 */

/** The marketplace name declared in `.claude-plugin/marketplace.json`. */
export const MARKETPLACE_NAME = 'hypergrove';
/** The plugin name declared in the marketplace + plugin.json. */
export const PLUGIN_NAME = 'grove';
/** Fully-qualified plugin reference used by `claude plugin install/update`. */
export const PLUGIN_REF = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

/** Result of a plugin action, shaped like the other command results. */
export interface PluginActionResult {
	success: boolean;
	message: string;
	details?: string[];
}

/** Whether the `claude` CLI is available on PATH (memoized by commandExists). */
export function isClaudeCliAvailable(): Promise<boolean> {
	return commandExists('claude');
}

/**
 * Absolute path to the bundled marketplace source (the package root, which
 * contains `.claude-plugin/marketplace.json`). Returns null if the package root
 * can't be located.
 */
export function getMarketplaceSourcePath(): string | null {
	return findPackageRoot();
}

/** Claude Code config dir: `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
function getClaudeConfigDir(): string {
	return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function readJsonFile<T>(filePath: string): T | null {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8')) as T;
	} catch {
		return null;
	}
}

interface KnownMarketplaces {
	[name: string]: { installLocation?: string };
}

/** The recorded install location of our marketplace, or null if not registered. */
export function getRegisteredMarketplacePath(): string | null {
	const file = path.join(getClaudeConfigDir(), 'plugins', 'known_marketplaces.json');
	const known = readJsonFile<KnownMarketplaces>(file);
	return known?.[MARKETPLACE_NAME]?.installLocation ?? null;
}

/** Whether our marketplace is currently registered with Claude. */
export function isMarketplaceRegistered(): boolean {
	return getRegisteredMarketplacePath() !== null;
}

interface InstalledPlugins {
	plugins?: Record<string, Array<{ scope?: string; version?: string }>>;
}

/**
 * The installed version of the Grove plugin (preferring the user-scope entry),
 * or null when it isn't installed.
 */
export function getInstalledPluginVersion(): string | null {
	const file = path.join(getClaudeConfigDir(), 'plugins', 'installed_plugins.json');
	const installed = readJsonFile<InstalledPlugins>(file);
	const entries = installed?.plugins?.[PLUGIN_REF];
	if (!entries || entries.length === 0) {
		return null;
	}
	const userEntry = entries.find((e) => e.scope === 'user') ?? entries[0];
	return userEntry.version ?? null;
}

/** Whether the Grove plugin is currently installed. */
export function isPluginInstalled(): boolean {
	return getInstalledPluginVersion() !== null;
}

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Run `claude plugin …` synchronously and capture output. */
function runClaudePlugin(args: string[]): RunResult {
	const result = spawnSync('claude', ['plugin', ...args], { encoding: 'utf8' });
	if (result.error) {
		return { code: 1, stdout: '', stderr: result.error.message };
	}
	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
}

/**
 * Register the bundled marketplace at user scope (idempotent — a no-op when
 * already registered).
 */
export function addMarketplace(): PluginActionResult {
	if (isMarketplaceRegistered()) {
		return { success: true, message: `Marketplace "${MARKETPLACE_NAME}" already registered` };
	}
	const source = getMarketplaceSourcePath();
	if (source === null) {
		return { success: false, message: 'Could not locate the Grove package directory' };
	}
	const { code, stderr } = runClaudePlugin(['marketplace', 'add', source, '--scope', 'user']);
	return code === 0
		? { success: true, message: `Registered marketplace "${MARKETPLACE_NAME}"` }
		: { success: false, message: 'Failed to register marketplace', details: [stderr.trim()] };
}

/** Install (or reinstall) the Grove plugin from the registered marketplace. */
export function installPlugin(): PluginActionResult {
	const { code, stderr } = runClaudePlugin(['install', PLUGIN_REF]);
	return code === 0
		? { success: true, message: `Installed plugin "${PLUGIN_REF}"` }
		: { success: false, message: 'Failed to install plugin', details: [stderr.trim()] };
}

/**
 * Refresh the marketplace metadata then update the plugin to the bundled
 * version. Requires a version bump to have effect (see module docs).
 */
export function syncPlugin(): PluginActionResult {
	const update = runClaudePlugin(['marketplace', 'update', MARKETPLACE_NAME]);
	if (update.code !== 0) {
		return {
			success: false,
			message: 'Failed to refresh marketplace',
			details: [update.stderr.trim()],
		};
	}
	const { code, stdout, stderr } = runClaudePlugin(['update', PLUGIN_REF]);
	return code === 0
		? { success: true, message: 'Grove skill synced', details: [stdout.trim()].filter(Boolean) }
		: { success: false, message: 'Failed to update plugin', details: [stderr.trim()] };
}

/** Uninstall the plugin and remove the marketplace. Best-effort for each step. */
export function uninstallPlugin(): PluginActionResult {
	const details: string[] = [];
	let ok = true;

	if (isPluginInstalled()) {
		const { code, stderr } = runClaudePlugin(['uninstall', PLUGIN_REF]);
		if (code === 0) {
			details.push(`Uninstalled plugin "${PLUGIN_REF}"`);
		} else {
			ok = false;
			details.push(`Could not uninstall plugin: ${stderr.trim()}`);
		}
	}

	if (isMarketplaceRegistered()) {
		const { code, stderr } = runClaudePlugin(['marketplace', 'remove', MARKETPLACE_NAME]);
		if (code === 0) {
			details.push(`Removed marketplace "${MARKETPLACE_NAME}"`);
		} else {
			ok = false;
			details.push(`Could not remove marketplace: ${stderr.trim()}`);
		}
	}

	return {
		success: ok,
		message: ok ? 'Grove skill uninstalled' : 'Grove skill partially uninstalled',
		details: details.length > 0 ? details : undefined,
	};
}

/**
 * Fire a plugin sync in the background without blocking. Used at startup after a
 * `hypergrove` npm upgrade so the skill catches up to the new bundled version.
 * Detached and fully ignored — the running Grove process does not wait, and any
 * failure is silent (the next `grove skill status`/`update` surfaces it).
 */
export function syncPluginDetached(): void {
	try {
		// Refresh the marketplace metadata first, then update the plugin once that
		// completes — the update reads the refreshed catalog, so the steps must be
		// ordered, not parallel.
		const refresh = spawn('claude', ['plugin', 'marketplace', 'update', MARKETPLACE_NAME], {
			stdio: 'ignore',
			detached: true,
		});
		refresh.on('error', () => {});
		refresh.on('exit', (code) => {
			if (code !== 0) {
				return;
			}
			const update = spawn('claude', ['plugin', 'update', PLUGIN_REF], {
				stdio: 'ignore',
				detached: true,
			});
			update.on('error', () => {});
			update.unref();
		});
		refresh.unref();
	} catch {
		// Never let a best-effort background sync affect startup.
	}
}
