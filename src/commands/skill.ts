import { existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

import {
	MARKETPLACE_NAME,
	PLUGIN_REF,
	addMarketplace,
	getInstalledPluginVersion,
	getRegisteredMarketplacePath,
	installPlugin,
	isClaudeCliAvailable,
	isMarketplaceRegistered,
	isPluginInstalled,
	syncPlugin,
	uninstallPlugin,
} from '../utils/claudePlugin.js';
import { getAppVersion } from '../utils/version.js';

export type SkillAction = 'install' | 'status' | 'update' | 'uninstall';

export interface SkillResult {
	success: boolean;
	message: string;
	details?: string[];
}

/** Path to the legacy hand-placed personal skill (pre-plugin distribution). */
function legacySkillPath(): string {
	return path.join(os.homedir(), '.claude', 'skills', 'grove');
}

/** A result telling the user the `claude` CLI is required but missing. */
function claudeMissingResult(): SkillResult {
	return {
		success: false,
		message: 'The `claude` CLI was not found on your PATH',
		details: [
			'The Grove skill ships as a Claude Code plugin and needs the Claude Code CLI.',
			'Install Claude Code, then re-run `grove skill install`.',
		],
	};
}

/**
 * Detect the legacy `~/.claude/skills/grove` copy (the old distribution) and
 * remove it so it doesn't shadow the plugin skill. Returns a detail line when it
 * removed something.
 */
function removeLegacySkill(): string | null {
	const legacy = legacySkillPath();
	if (!existsSync(legacy)) {
		return null;
	}
	try {
		rmSync(legacy, { recursive: true, force: true });
		return `Removed the legacy skill copy at ${legacy}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return `Could not remove the legacy skill copy at ${legacy}: ${message}`;
	}
}

async function install(): Promise<SkillResult> {
	if (!(await isClaudeCliAvailable())) {
		return claudeMissingResult();
	}

	const marketplace = addMarketplace();
	if (!marketplace.success) {
		return marketplace;
	}

	// If already installed, sync to the bundled version; otherwise do a fresh
	// install from the just-registered marketplace.
	const result = isPluginInstalled() ? syncPlugin() : installPlugin();
	if (!result.success) {
		return result;
	}

	const details: string[] = [`Marketplace: ${MARKETPLACE_NAME}`, `Plugin: ${PLUGIN_REF}`];
	const legacyNote = removeLegacySkill();
	if (legacyNote) {
		details.push(legacyNote);
	}
	details.push('Restart Claude Code to load the skill.');

	return {
		success: true,
		message: `Grove skill installed (v${getAppVersion()})`,
		details,
	};
}

function status(): SkillResult {
	const bundled = getAppVersion();
	const installedVersion = getInstalledPluginVersion();
	const registeredPath = getRegisteredMarketplacePath();

	const details: string[] = [
		`Bundled version:   ${bundled}`,
		`Installed version: ${installedVersion ?? 'not installed'}`,
		`Marketplace:       ${isMarketplaceRegistered() ? `registered (${registeredPath})` : 'not registered'}`,
	];

	if (registeredPath && !existsSync(registeredPath)) {
		details.push(
			`⚠ The registered marketplace path no longer exists — run \`grove skill install\` to re-point it.`
		);
	}

	if (installedVersion && installedVersion !== bundled) {
		details.push(`A newer version is bundled — run \`grove skill update\` to sync.`);
	}

	return {
		success: true,
		message: installedVersion ? 'Grove skill is installed' : 'Grove skill is not installed',
		details,
	};
}

async function update(): Promise<SkillResult> {
	if (!(await isClaudeCliAvailable())) {
		return claudeMissingResult();
	}
	if (!isMarketplaceRegistered()) {
		return {
			success: false,
			message: 'Grove skill is not installed',
			details: ['Run `grove skill install` first.'],
		};
	}
	const result = syncPlugin();
	if (result.success) {
		result.details = [...(result.details ?? []), 'Restart Claude Code to apply.'];
	}
	return result;
}

async function uninstall(): Promise<SkillResult> {
	if (!(await isClaudeCliAvailable())) {
		return claudeMissingResult();
	}
	return uninstallPlugin();
}

/** Handle `grove skill <action>`. */
export async function manageSkill(action: SkillAction): Promise<SkillResult> {
	switch (action) {
		case 'install':
			return install();
		case 'status':
			return status();
		case 'update':
			return update();
		case 'uninstall':
			return uninstall();
	}
}
