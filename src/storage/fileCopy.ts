import fs from 'fs';
import path from 'path';

import { glob } from 'glob';

/**
 * Copy files matching glob patterns from source directory to destination directory
 * @param sourceDir - Source directory to search for files
 * @param destDir - Destination directory to copy files to
 * @param patterns - Array of glob patterns to match files
 * @returns Array of copied file paths
 */
export async function copyFilesFromPatterns(
	sourceDir: string,
	destDir: string,
	patterns: string[]
): Promise<string[]> {
	const copiedFiles: string[] = [];

	if (!patterns || patterns.length === 0) {
		return copiedFiles;
	}

	// Ensure destination directory exists
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	for (const pattern of patterns) {
		try {
			// Find files matching the pattern in the source directory
			const matches = await glob(pattern, {
				cwd: sourceDir,
				dot: true, // Include hidden files (like .gitignore)
				nodir: true, // Only match files, not directories
				absolute: false, // Return relative paths
			});

			// Copy each matched file
			for (const relativeFilePath of matches) {
				const sourcePath = path.join(sourceDir, relativeFilePath);
				const destPath = path.join(destDir, relativeFilePath);

				// Create destination directory if it doesn't exist
				const destFileDir = path.dirname(destPath);
				if (!fs.existsSync(destFileDir)) {
					fs.mkdirSync(destFileDir, { recursive: true });
				}

				// Copy the file
				fs.copyFileSync(sourcePath, destPath);
				copiedFiles.push(relativeFilePath);
			}
		} catch (error) {
			// Log error but continue with other patterns
			console.error(`Error copying files for pattern "${pattern}":`, error);
		}
	}

	return copiedFiles;
}
