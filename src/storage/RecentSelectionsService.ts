import fs from 'fs';

import type { IRecentSelectionsService } from '../services/interfaces.js';
import type { SettingsService } from './SettingsService.js';
import type { RecentSelection, RecentSelectionsData, RepositorySelection } from './types.js';

const MAX_RECENT_SELECTIONS = 3;

/**
 * Recent selections service implementation
 * Manages recently used repository/project selections stored in ~/.grove/recent.json
 */
export class RecentSelectionsService implements IRecentSelectionsService {
	constructor(private readonly settingsService: SettingsService) {}

	/**
	 * Get default recent selections data
	 */
	private getDefaultRecentSelections(): RecentSelectionsData {
		return {
			selections: [],
		};
	}

	/**
	 * Read recent selections from recent.json
	 */
	private readRecentSelections(): RecentSelectionsData {
		const config = this.settingsService.getStorageConfig();

		try {
			if (!fs.existsSync(config.recentSelectionsPath)) {
				return this.getDefaultRecentSelections();
			}

			const data = fs.readFileSync(config.recentSelectionsPath, 'utf-8');
			const recentData = JSON.parse(data) as RecentSelectionsData;

			return recentData;
		} catch {
			return this.getDefaultRecentSelections();
		}
	}

	/**
	 * Write recent selections to recent.json
	 */
	private writeRecentSelections(data: RecentSelectionsData): void {
		const config = this.settingsService.getStorageConfig();

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
	private getSelectionKey(repositoryPath: string, projectPath?: string): string {
		return projectPath ? `${repositoryPath}::${projectPath}` : repositoryPath;
	}

	/**
	 * Add selections to recent history
	 * Called after a grove is successfully created
	 */
	addRecentSelections(selections: RepositorySelection[]): void {
		const data = this.readRecentSelections();
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
			const key = this.getSelectionKey(sel.repositoryPath, sel.projectPath);
			selectionMap.set(key, sel);
		}

		// Add new selections (will override if duplicate)
		for (const sel of newEntries) {
			const key = this.getSelectionKey(sel.repositoryPath, sel.projectPath);
			selectionMap.set(key, sel);
		}

		// Convert back to array and sort by lastUsedAt descending
		const allSelections = Array.from(selectionMap.values()).sort(
			(a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
		);

		// Keep only the most recent MAX_RECENT_SELECTIONS
		data.selections = allSelections.slice(0, MAX_RECENT_SELECTIONS);

		this.writeRecentSelections(data);
	}

	/**
	 * Get recent selections that are still valid (repository still registered)
	 */
	getRecentSelections(registeredRepoPaths: Set<string>): RecentSelection[] {
		const data = this.readRecentSelections();

		// Filter to only include selections for registered repositories
		return data.selections.filter((sel) => registeredRepoPaths.has(sel.repositoryPath));
	}

	/**
	 * Get display name for a recent selection
	 * Format: "repoName" or "repoName.projectFolder" for monorepo projects
	 */
	getRecentSelectionDisplayName(selection: RecentSelection): string {
		if (selection.projectPath) {
			return `${selection.repositoryName}.${selection.projectPath}`;
		}
		return selection.repositoryName;
	}
}
