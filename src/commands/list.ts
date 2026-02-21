import path from 'path';

import { getContainer } from '../di/index.js';
import { GrovesServiceToken } from '../services/tokens.js';
import type { GroveMetadata, GroveReference, Worktree } from '../storage/types.js';

/**
 * Grove data with worktree details for list output
 */
export interface GroveListEntry {
	id: string;
	name: string;
	path: string;
	createdAt: string;
	updatedAt: string;
	worktrees: WorktreeListEntry[];
}

/**
 * Worktree data for list output
 */
export interface WorktreeListEntry {
	name?: string;
	repositoryName: string;
	branch: string;
	worktreePath: string;
	projectPath: string;
}

/**
 * Result of list groves command
 */
export interface ListGrovesResult {
	success: boolean;
	message: string;
	groves: GroveListEntry[];
}

/**
 * Map a Worktree to a WorktreeListEntry
 */
function mapWorktree(wt: Worktree): WorktreeListEntry {
	const entry: WorktreeListEntry = {
		repositoryName: wt.repositoryName,
		branch: wt.branch,
		worktreePath: wt.worktreePath,
		projectPath: wt.projectPath ? path.join(wt.worktreePath, wt.projectPath) : wt.worktreePath,
	};
	if (wt.name) entry.name = wt.name;
	return entry;
}

/**
 * Build a GroveListEntry from a GroveReference and optional metadata
 */
function buildGroveEntry(groveRef: GroveReference, metadata: GroveMetadata | null): GroveListEntry {
	return {
		id: groveRef.id,
		name: groveRef.name,
		path: groveRef.path,
		createdAt: groveRef.createdAt,
		updatedAt: groveRef.updatedAt,
		worktrees: metadata ? metadata.worktrees.filter((wt) => !wt.closed).map(mapWorktree) : [],
	};
}

/**
 * Format a grove entry as human-readable text lines
 */
function formatGroveText(grove: GroveListEntry): string[] {
	const lines: string[] = [];

	lines.push(`${grove.name} (${grove.id})`);
	lines.push(`  Path:       ${grove.path}`);
	lines.push(`  Created:    ${grove.createdAt}`);
	lines.push(`  Updated:    ${grove.updatedAt}`);
	lines.push(`  Worktrees:  ${grove.worktrees.length}`);

	for (const wt of grove.worktrees) {
		const displayName = wt.name || wt.repositoryName;
		lines.push(`    - ${displayName}`);
		lines.push(`      Branch:  ${wt.branch}`);
		lines.push(`      Path:    ${wt.worktreePath}`);
		lines.push(`      Project: ${wt.projectPath}`);
	}

	return lines;
}

/**
 * List all groves with their worktree details
 * @returns Result with grove data
 */
export function listGroves(): ListGrovesResult {
	try {
		const container = getContainer();
		const grovesService = container.resolve(GrovesServiceToken);

		const allGroves = grovesService.getAllGroves();

		const groves = allGroves.map((groveRef) => {
			const metadata = grovesService.readGroveMetadata(groveRef.path);
			return buildGroveEntry(groveRef, metadata);
		});

		return {
			success: true,
			message: `Found ${groves.length} grove(s)`,
			groves,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			message: `Failed to list groves: ${errorMessage}`,
			groves: [],
		};
	}
}

/**
 * Format list groves result as human-readable text
 */
export function formatGrovesText(result: ListGrovesResult): string {
	if (!result.success) {
		return result.message;
	}

	if (result.groves.length === 0) {
		return 'No groves found.';
	}

	const sections = result.groves.map(formatGroveText);
	return sections.map((lines) => lines.join('\n')).join('\n\n');
}
