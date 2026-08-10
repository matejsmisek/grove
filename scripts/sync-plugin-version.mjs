#!/usr/bin/env node
/**
 * Keep the bundled Claude Code plugin version in lockstep with package.json.
 *
 * The Grove skill ships as a Claude Code plugin (`grove@hypergrove`). Claude
 * snapshots plugin content *per version*: editing a skill without bumping the
 * version is silently ignored on `claude plugin update`. So the version in
 * `.claude-plugin/marketplace.json` (the plugin entry) and
 * `plugins/grove/.claude-plugin/plugin.json` MUST always equal package.json's
 * version, or published updates won't propagate to users.
 *
 * Modes:
 *   node scripts/sync-plugin-version.mjs           # write package version into both manifests
 *   node scripts/sync-plugin-version.mjs --check    # exit 1 if either manifest is out of sync
 *
 * `--check` runs in prepublishOnly as a publish guard; the plain form runs in
 * the npm `version` lifecycle so `npm version <bump>` updates the manifests and
 * stages them into the version commit.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const marketplacePath = join(repoRoot, '.claude-plugin', 'marketplace.json');
const pluginPath = join(repoRoot, 'plugins', 'grove', '.claude-plugin', 'plugin.json');

const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
if (typeof version !== 'string' || version.length === 0) {
	console.error('✗ Could not read version from package.json');
	process.exit(1);
}

/** Read + JSON.parse, exiting with a clear message on failure. */
function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		console.error(`✗ Could not read ${path}: ${error.message}`);
		process.exit(1);
	}
}

const marketplace = readJson(marketplacePath);
const plugin = readJson(pluginPath);

const grove = marketplace.plugins?.find((p) => p.name === 'grove');
if (!grove) {
	console.error('✗ marketplace.json has no "grove" plugin entry');
	process.exit(1);
}

const drift = [];
if (grove.version !== version) {
	drift.push(`marketplace.json grove entry: ${grove.version} → ${version}`);
}
if (plugin.version !== version) {
	drift.push(`plugin.json: ${plugin.version} → ${version}`);
}

if (drift.length === 0) {
	console.log(`✓ Plugin manifests already at v${version}`);
	process.exit(0);
}

if (checkOnly) {
	console.error('✗ Plugin manifest version drift (run `npm run sync-plugin-version`):');
	drift.forEach((line) => console.error(`  ${line}`));
	process.exit(1);
}

/**
 * Replace only the version string in-place, preserving the file's exact
 * formatting (so the output stays Prettier-clean and the npm `version` commit
 * doesn't reformat). The `"version": ` prefix keeps the match scoped to the
 * version field rather than any value that happens to equal the old version.
 */
function replaceVersion(filePath, oldVersion, newVersion) {
	const text = readFileSync(filePath, 'utf8');
	const needle = `"version": "${oldVersion}"`;
	if (!text.includes(needle)) {
		console.error(`✗ Could not find ${needle} in ${filePath}`);
		process.exit(1);
	}
	writeFileSync(filePath, text.replace(needle, `"version": "${newVersion}"`));
}

if (grove.version !== version) {
	replaceVersion(marketplacePath, grove.version, version);
}
if (plugin.version !== version) {
	replaceVersion(pluginPath, plugin.version, version);
}
console.log(`✓ Synced plugin manifests to v${version}`);
drift.forEach((line) => console.log(`  ${line}`));
