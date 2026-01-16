import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Opens the user's preferred editor to edit text content.
 * Uses $EDITOR environment variable, falling back to common editors.
 *
 * @param content - Initial content to edit
 * @param options - Optional configuration
 * @returns The edited content, or null if cancelled/failed
 */
export function openExternalEditor(
	content: string,
	options: {
		/** File extension for syntax highlighting (e.g., '.txt', '.json') */
		extension?: string;
		/** Prefix for the temp file name */
		prefix?: string;
	} = {}
): string | null {
	const { extension = '.txt', prefix = 'grove-edit-' } = options;

	// Create temp file
	const tempDir = os.tmpdir();
	const tempFile = path.join(tempDir, `${prefix}${Date.now()}${extension}`);

	try {
		// Write content to temp file
		fs.writeFileSync(tempFile, content, 'utf-8');

		// Get editor from environment or use fallbacks
		const editor = getEditor();
		if (!editor) {
			console.error('No editor found. Set $EDITOR environment variable.');
			return null;
		}

		// Open editor and wait for it to close
		const result = spawnSync(editor, [tempFile], {
			stdio: 'inherit',
			shell: true,
		});

		if (result.status !== 0) {
			return null;
		}

		// Read edited content
		const editedContent = fs.readFileSync(tempFile, 'utf-8');
		return editedContent;
	} catch (error) {
		console.error('Error opening editor:', error);
		return null;
	} finally {
		// Clean up temp file
		try {
			if (fs.existsSync(tempFile)) {
				fs.unlinkSync(tempFile);
			}
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Gets the user's preferred editor from environment variables
 * or finds a common editor installed on the system.
 */
function getEditor(): string | null {
	// Check environment variables
	const envEditor = process.env.EDITOR || process.env.VISUAL;
	if (envEditor) {
		return envEditor;
	}

	// Common editors to try as fallbacks
	const fallbackEditors = ['nano', 'vim', 'vi', 'code --wait', 'notepad'];

	for (const editor of fallbackEditors) {
		const command = editor.split(' ')[0];
		try {
			const result = spawnSync('which', [command], { encoding: 'utf-8' });
			if (result.status === 0 && result.stdout.trim()) {
				return editor;
			}
		} catch {
			// Try next editor
		}
	}

	return null;
}

/**
 * Checks if an external editor is available
 */
export function hasExternalEditor(): boolean {
	return getEditor() !== null;
}
