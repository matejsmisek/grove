import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

import { getPatternString } from '../storage/GroveConfigService.js';
import type { FileCopyPatternEntry } from '../storage/types.js';
import type { FileCopyResult, FileMatchResult } from './types.js';

// Re-export types for convenience
export type { FileCopyResult, FileMatchResult } from './types.js';

/**
 * File service interface
 * Provides file operations including pattern matching and copying
 */
export interface IFileService {
	/** Find files matching a glob pattern */
	matchPattern(sourceDir: string, pattern: string): Promise<string[]>;
	/** Find files matching multiple glob patterns */
	matchPatterns(sourceDir: string, patterns: string[]): Promise<FileMatchResult[]>;
	/** Copy a single file preserving directory structure */
	copyFile(sourceDir: string, destDir: string, relativeFilePath: string): void;
	/** Create a symbolic link for a file, preserving directory structure */
	linkFile(sourceDir: string, destDir: string, relativeFilePath: string): void;
	/** Copy or symlink files matching glob patterns */
	copyFilesFromPatterns(
		sourceDir: string,
		destDir: string,
		patterns: FileCopyPatternEntry[]
	): Promise<FileCopyResult>;
	/** Check if a path exists */
	exists(filePath: string): boolean;
	/** Check if a path is a directory */
	isDirectory(filePath: string): boolean;
	/** Check if a path is a file */
	isFile(filePath: string): boolean;
}

/**
 * Service for file operations including pattern matching and copying
 */
export class FileService implements IFileService {
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
	 * Create a symbolic link for a file, preserving directory structure.
	 * The symlink points to the absolute path of the source file.
	 * @param sourceDir - Source base directory
	 * @param destDir - Destination base directory
	 * @param relativeFilePath - Relative path of the file to link
	 */
	linkFile(sourceDir: string, destDir: string, relativeFilePath: string): void {
		const sourcePath = path.resolve(sourceDir, relativeFilePath);
		const destPath = path.join(destDir, relativeFilePath);

		// Create destination directory if it doesn't exist
		const destFileDir = path.dirname(destPath);
		if (!fs.existsSync(destFileDir)) {
			fs.mkdirSync(destFileDir, { recursive: true });
		}

		// Create symbolic link pointing to the source file
		fs.symlinkSync(sourcePath, destPath);
	}

	/**
	 * Copy or symlink files matching glob patterns from source directory to destination directory.
	 * Each pattern entry can specify a mode: "copy" (default) or "link" (symlink).
	 * @param sourceDir - Source directory to search for files
	 * @param destDir - Destination directory to copy/link files to
	 * @param patterns - Array of pattern entries (string or [string, mode] tuples)
	 * @returns FileCopyResult with success status, copied files, linked files, and errors
	 */
	async copyFilesFromPatterns(
		sourceDir: string,
		destDir: string,
		patterns: FileCopyPatternEntry[]
	): Promise<FileCopyResult> {
		const copiedFiles: string[] = [];
		const linkedFiles: string[] = [];
		const errors: string[] = [];

		if (!patterns || patterns.length === 0) {
			return { success: true, copiedFiles, linkedFiles, errors };
		}

		// Ensure destination directory exists
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}

		for (const entry of patterns) {
			const patternStr = getPatternString(entry);
			const mode = typeof entry === 'string' ? 'copy' : entry[1];

			try {
				// Find files matching the pattern
				const matches = await this.matchPattern(sourceDir, patternStr);

				// Copy or link each matched file
				for (const relativeFilePath of matches) {
					try {
						if (mode === 'link') {
							this.linkFile(sourceDir, destDir, relativeFilePath);
							linkedFiles.push(relativeFilePath);
						} else {
							this.copyFile(sourceDir, destDir, relativeFilePath);
							copiedFiles.push(relativeFilePath);
						}
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : 'Unknown error';
						const action = mode === 'link' ? 'link' : 'copy';
						errors.push(`Failed to ${action} "${relativeFilePath}": ${errorMsg}`);
					}
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`Pattern "${patternStr}": ${errorMsg}`);
			}
		}

		return {
			success: errors.length === 0,
			copiedFiles,
			linkedFiles,
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
