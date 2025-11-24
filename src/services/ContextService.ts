import fs from 'fs';
import path from 'path';

import type { ContextData, IContextService } from './interfaces.js';

// Re-export types for backward compatibility
export type { ContextData } from './interfaces.js';

/**
 * Service for managing grove context files (CONTEXT.md)
 * Handles creation, reading, and updating of context documentation
 */
export class ContextService implements IContextService {
	private static readonly CONTEXT_FILENAME = 'CONTEXT.md';

	/**
	 * Generate the content for a CONTEXT.md file
	 * @param data - Context data to generate content from
	 * @returns Formatted markdown content
	 */
	generateContent(data: ContextData): string {
		const repoList = data.repositories.map((repo) => `- ${repo.name}: ${repo.path}`).join('\n');
		const purpose = data.purpose || "[Add description of what you're working on in this grove]";
		const notes = data.notes || '[Add any additional notes or context here]';

		return `# ${data.name}

Created: ${data.createdAt}

## Purpose

${purpose}

## Repositories

${repoList}

## Notes

${notes}
`;
	}

	/**
	 * Create a CONTEXT.md file in a grove folder
	 * @param grovePath - Path to the grove folder
	 * @param data - Context data for the grove
	 */
	createContextFile(grovePath: string, data: ContextData): void {
		const contextPath = path.join(grovePath, ContextService.CONTEXT_FILENAME);
		const content = this.generateContent(data);
		fs.writeFileSync(contextPath, content, 'utf-8');
	}

	/**
	 * Check if a context file exists in a grove folder
	 * @param grovePath - Path to the grove folder
	 * @returns True if CONTEXT.md exists
	 */
	contextFileExists(grovePath: string): boolean {
		const contextPath = path.join(grovePath, ContextService.CONTEXT_FILENAME);
		return fs.existsSync(contextPath);
	}

	/**
	 * Read the raw content of a context file
	 * @param grovePath - Path to the grove folder
	 * @returns Content of CONTEXT.md or null if not found
	 */
	readContextFile(grovePath: string): string | null {
		const contextPath = path.join(grovePath, ContextService.CONTEXT_FILENAME);

		if (!fs.existsSync(contextPath)) {
			return null;
		}

		return fs.readFileSync(contextPath, 'utf-8');
	}

	/**
	 * Get the path to the context file for a grove
	 * @param grovePath - Path to the grove folder
	 * @returns Full path to the CONTEXT.md file
	 */
	getContextFilePath(grovePath: string): string {
		return path.join(grovePath, ContextService.CONTEXT_FILENAME);
	}
}
