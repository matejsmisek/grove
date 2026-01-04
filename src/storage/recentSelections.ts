import fs from 'fs';

import { getStorageConfig } from './storage.js';
import type { RecentSelection, RecentSelectionsData, RepositorySelection } from './types.js';

const MAX_RECENT_SELECTIONS = 3;

/**
 * Get default recent selections data
 */
export function getDefaultRecentSelections(): RecentSelectionsData {
	return {
		selections: [],
	};
}

/**
 * Read recent selections from recent.json
 */
export function readRecentSelections(): RecentSelectionsData {
	const config = getStorageConfig();

	try {
		if (!fs.existsSync(config.recentSelectionsPath)) {
			return getDefaultRecentSelections();
		}

		const data = fs.readFileSync(config.recentSelectionsPath, 'utf-8');
		const recentData = JSON.parse(data) as RecentSelectionsData;

		return recentData;
	} catch {
		return getDefaultRecentSelections();
	}
}

/**
 * Write recent selections to recent.json
 */
export function writeRecentSelections(data: RecentSelectionsData): void {
	const config = getStorageConfig();

	try {
		// Ensure .grove folder exists
		if (!fs.existsSync(config.groveFolder)) {
			fs.mkdirSync(config.groveFolder, { recursive: true });
		}

		// Write with pretty formatting
		const jsonData = JSON.stringify(data, null, '\t');
		fs.writeFileSync(config.recentSelectionsPath, jsonData, 'utf-8');
	} catch {
		// Silently fail - recent selections are not critical
	}
}

/**
 * Generate a unique key for a selection (for deduplication)
 */
function getSelectionKey(repositoryPath: string, projectPath?: string): string {
	return projectPath ? `${repositoryPath}::${projectPath}` : repositoryPath;
}

/**
 * Add selections to recent history
 * Called after a grove is successfully created
 */
export function addRecentSelections(selections: RepositorySelection[]): void {
	const data = readRecentSelections();
	const now = new Date().toISOString();

	// Create new recent entries from selections
	const newEntries: RecentSelection[] = selections.map((sel) => ({
		repositoryPath: sel.repository.path,
		repositoryName: sel.repository.name,
		projectPath: sel.projectPath,
		lastUsedAt: now,
	}));

	// Build a map to deduplicate - newer entries override older ones
	const selectionMap = new Map<string, RecentSelection>();

	// Add existing selections first (older)
	for (const sel of data.selections) {
		const key = getSelectionKey(sel.repositoryPath, sel.projectPath);
		selectionMap.set(key, sel);
	}

	// Add new selections (will override if duplicate)
	for (const sel of newEntries) {
		const key = getSelectionKey(sel.repositoryPath, sel.projectPath);
		selectionMap.set(key, sel);
	}

	// Convert back to array and sort by lastUsedAt descending
	const allSelections = Array.from(selectionMap.values()).sort(
		(a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
	);

	// Keep only the most recent MAX_RECENT_SELECTIONS
	data.selections = allSelections.slice(0, MAX_RECENT_SELECTIONS);

	writeRecentSelections(data);
}

/**
 * Get recent selections that are still valid (repository still registered)
 */
export function getRecentSelections(registeredRepoPaths: Set<string>): RecentSelection[] {
	const data = readRecentSelections();

	// Filter to only include selections for registered repositories
	return data.selections.filter((sel) => registeredRepoPaths.has(sel.repositoryPath));
}

/**
 * Get display name for a recent selection
 * Format: "repoName" or "repoName.projectFolder" for monorepo projects
 */
export function getRecentSelectionDisplayName(selection: RecentSelection): string {
	if (selection.projectPath) {
		return `${selection.repositoryName}.${selection.projectPath}`;
	}
	return selection.repositoryName;
}
