import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { CaretPosition } from './promptTemplate.js';

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
		/**
		 * Where to place the caret when the editor opens (1-based line/column).
		 * Best-effort: only honored for editors whose argument syntax is known
		 * (vim/nvim, nano, emacs, VS Code, etc.). Ignored otherwise.
		 */
		cursor?: CaretPosition;
	} = {}
): string | null {
	const { extension = '.txt', prefix = 'grove-edit-', cursor } = options;

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
		const { command, args } = buildEditorInvocation(editor, tempFile, cursor);
		const result = spawnSync(command, args, {
			stdio: 'inherit',
		});

		if (result.error || result.status !== 0) {
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
 * Build the command and argument list for launching an editor on a file,
 * optionally positioning the caret at a given line/column.
 *
 * The `editor` string may include flags (e.g. "code --wait"); the first token
 * is treated as the binary and the rest as base arguments. Caret positioning is
 * best-effort: editors with a known syntax get the right flags, all others just
 * open the file.
 *
 * Exported for testing.
 */
export function buildEditorInvocation(
	editor: string,
	file: string,
	cursor?: CaretPosition
): { command: string; args: string[] } {
	const tokens = editor.trim().split(/\s+/);
	const command = tokens[0];
	const baseArgs = tokens.slice(1);

	if (!cursor) {
		return { command, args: [...baseArgs, file] };
	}

	const { line, column } = cursor;
	const binary = path
		.basename(command)
		.toLowerCase()
		.replace(/\.exe$/, '');

	switch (binary) {
		case 'vim':
		case 'nvim':
		case 'gvim':
		case 'mvim':
		case 'vi':
			// `+call cursor(line, col)` runs as an ex command after opening.
			return { command, args: [...baseArgs, `+call cursor(${line},${column})`, file] };

		case 'nano':
			return { command, args: [...baseArgs, `+${line},${column}`, file] };

		case 'emacs':
		case 'emacsclient':
			return { command, args: [...baseArgs, `+${line}:${column}`, file] };

		case 'micro':
			return { command, args: [...baseArgs, `+${line}:${column}`, file] };

		case 'kak':
			return { command, args: [...baseArgs, `+${line}:${column}`, file] };

		case 'hx':
		case 'helix':
		case 'subl':
		case 'sublime_text':
			// These take the location appended to the file path.
			return { command, args: [...ensureWaitFlag(baseArgs), `${file}:${line}:${column}`] };

		case 'code':
		case 'code-insiders':
		case 'codium':
		case 'vscodium':
		case 'cursor':
		case 'windsurf':
			return {
				command,
				args: [...ensureWaitFlag(baseArgs), '--goto', `${file}:${line}:${column}`],
			};

		default:
			// Unknown editor - open the file without positioning.
			return { command, args: [...baseArgs, file] };
	}
}

/**
 * Ensure a `--wait` flag is present so the editor blocks until the file is
 * closed (GUI editors like VS Code/Sublime return immediately otherwise).
 */
function ensureWaitFlag(args: string[]): string[] {
	if (args.includes('--wait') || args.includes('-w')) {
		return args;
	}
	return [...args, '--wait'];
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
