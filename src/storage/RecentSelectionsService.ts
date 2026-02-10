import type { IRecentSelectionsService, ISettingsService } from '../services/interfaces.js';
import { JsonStore } from './JsonStore.js';
import type { RecentSelection, RecentSelectionsData, RepositorySelection } from './types.js';

const MAX_RECENT_SELECTIONS = 3;

/**
 * Recent selections service implementation
 * Manages recently used repository/project selections stored in ~/.grove/recent.json
 */
export class RecentSelectionsService implements IRecentSelectionsService {
	private store: JsonStore<RecentSelectionsData>;

	constructor(private readonly settingsService: ISettingsService) {
		this.store = new JsonStore<RecentSelectionsData>(
			() => this.settingsService.getStorageConfig().recentSelectionsPath,
			() => this.settingsService.getStorageConfig().groveFolder,
			() => ({ selections: [] }),
			{
				label: 'recent selections',
				createOnFirstRead: false,
				silentWriteErrors: true,
			}
		);
	}

	/**
	 * Read recent selections from recent.json
	 */
	private readRecentSelections(): RecentSelectionsData {
		return this.store.read();
	}

	/**
	 * Write recent selections to recent.json
	 */
	private writeRecentSelections(data: RecentSelectionsData): void {
		this.store.write(data);
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
