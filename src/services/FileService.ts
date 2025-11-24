import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

import type { FileCopyResult, FileMatchResult } from './types.js';

export type { FileCopyResult, FileMatchResult } from './types.js';

/**
 * Service for file operations including pattern matching and copying
 */
export class FileService {
	/**
	 * Find files matching a glob pattern in a directory
	 * @param sourceDir - Directory to search in
	 * @param pattern - Glob pattern to match
	 * @returns Array of relative file paths that match the pattern
	 */
	async matchPattern(sourceDir: string, pattern: string): Promise<string[]> {
		try {
			const matches = await glob(pattern, {
				cwd: sourceDir,
				dot: true, // Include hidden files (like .gitignore)
				nodir: true, // Only match files, not directories
				absolute: false, // Return relative paths
			});

			return matches;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to match pattern "${pattern}": ${errorMsg}`);
		}
	}

	/**
	 * Find files matching multiple glob patterns in a directory
	 * @param sourceDir - Directory to search in
	 * @param patterns - Array of glob patterns to match
	 * @returns Array of FileMatchResult objects with pattern and matches
	 */
	async matchPatterns(sourceDir: string, patterns: string[]): Promise<FileMatchResult[]> {
		const results: FileMatchResult[] = [];

		for (const pattern of patterns) {
			try {
				const matches = await this.matchPattern(sourceDir, pattern);
				results.push({ pattern, matches });
			} catch {
				// Continue with other patterns if one fails
				results.push({ pattern, matches: [] });
			}
		}

		return results;
	}

	/**
	 * Copy a single file from source to destination, preserving directory structure
	 * @param sourceDir - Source base directory
	 * @param destDir - Destination base directory
	 * @param relativeFilePath - Relative path of the file to copy
	 */
	copyFile(sourceDir: string, destDir: string, relativeFilePath: string): void {
		const sourcePath = path.join(sourceDir, relativeFilePath);
		const destPath = path.join(destDir, relativeFilePath);

		// Create destination directory if it doesn't exist
		const destFileDir = path.dirname(destPath);
		if (!fs.existsSync(destFileDir)) {
			fs.mkdirSync(destFileDir, { recursive: true });
		}

		// Copy the file
		fs.copyFileSync(sourcePath, destPath);
	}

	/**
	 * Copy files matching glob patterns from source directory to destination directory
	 * @param sourceDir - Source directory to search for files
	 * @param destDir - Destination directory to copy files to
	 * @param patterns - Array of glob patterns to match files
	 * @returns FileCopyResult with success status, copied files, and errors
	 */
	async copyFilesFromPatterns(
		sourceDir: string,
		destDir: string,
		patterns: string[]
	): Promise<FileCopyResult> {
		const copiedFiles: string[] = [];
		const errors: string[] = [];

		if (!patterns || patterns.length === 0) {
			return { success: true, copiedFiles, errors };
		}

		// Ensure destination directory exists
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}

		for (const pattern of patterns) {
			try {
				// Find files matching the pattern
				const matches = await this.matchPattern(sourceDir, pattern);

				// Copy each matched file
				for (const relativeFilePath of matches) {
					try {
						this.copyFile(sourceDir, destDir, relativeFilePath);
						copiedFiles.push(relativeFilePath);
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : 'Unknown error';
						errors.push(`Failed to copy "${relativeFilePath}": ${errorMsg}`);
					}
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`Pattern "${pattern}": ${errorMsg}`);
			}
		}

		return {
			success: errors.length === 0,
			copiedFiles,
			errors,
		};
	}

	/**
	 * Check if a file or directory exists
	 * @param filePath - Path to check
	 * @returns True if the path exists
	 */
	exists(filePath: string): boolean {
		return fs.existsSync(filePath);
	}

	/**
	 * Check if a path is a directory
	 * @param filePath - Path to check
	 * @returns True if the path is a directory
	 */
	isDirectory(filePath: string): boolean {
		try {
			return fs.statSync(filePath).isDirectory();
		} catch {
			return false;
		}
	}

	/**
	 * Check if a path is a file
	 * @param filePath - Path to check
	 * @returns True if the path is a file
	 */
	isFile(filePath: string): boolean {
		try {
			return fs.statSync(filePath).isFile();
		} catch {
			return false;
		}
	}
}
