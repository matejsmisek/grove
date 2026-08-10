/**
 * Helpers for the launch-time prompt template.
 *
 * A prompt template is freeform text that prefills Claude's initial prompt when
 * launching a new session. It may contain the literal placeholder `{prompt}`
 * which marks where the editor caret should be placed; the placeholder itself is
 * removed before the text is opened in the editor (and again before launching, in
 * case the user re-typed it).
 */
import { hasExternalEditor, openExternalEditor } from './externalEditor.js';

/** The literal placeholder token used inside prompt templates. */
export const PROMPT_PLACEHOLDER = '{prompt}';

/**
 * A 1-based caret position within a text buffer (as most editors expect).
 */
export interface CaretPosition {
	line: number;
	column: number;
}

/**
 * Prepared prompt template ready to be opened in an editor.
 */
export interface PreparedPromptTemplate {
	/** Template content with the `{prompt}` placeholder removed. */
	content: string;
	/** Where the caret should be placed when the editor opens (1-based). */
	cursor: CaretPosition;
}

/**
 * Compute the 1-based line/column for a character index within `text`.
 */
function indexToCaret(text: string, index: number): CaretPosition {
	const before = text.slice(0, index);
	const lines = before.split('\n');
	return {
		line: lines.length,
		column: lines[lines.length - 1].length + 1,
	};
}

/**
 * Prepare a prompt template for editing: remove the `{prompt}` placeholder and
 * report where the caret should be positioned.
 *
 * - If the template contains `{prompt}`, the caret is placed where the first
 *   occurrence was and every occurrence is removed.
 * - If the template has no placeholder, the caret is placed at the end of the
 *   content.
 */
export function preparePromptTemplate(template: string): PreparedPromptTemplate {
	const placeholderIndex = template.indexOf(PROMPT_PLACEHOLDER);

	if (placeholderIndex === -1) {
		return {
			content: template,
			cursor: indexToCaret(template, template.length),
		};
	}

	const cursor = indexToCaret(template, placeholderIndex);
	const content = stripPlaceholder(template);

	return { content, cursor };
}

/**
 * Fill a prompt template by replacing the `{prompt}` placeholder with `replacement`
 * (instead of removing it, as {@link preparePromptTemplate} does).
 *
 * - If the template contains `{prompt}`, every occurrence is replaced with
 *   `replacement` and the caret is placed at the end of the first replacement.
 * - If the template has no placeholder, the replacement is appended (separated by
 *   a blank line when the template is non-empty) and the caret is placed at the
 *   end of the content.
 */
export function fillPromptTemplate(template: string, replacement: string): PreparedPromptTemplate {
	const placeholderIndex = template.indexOf(PROMPT_PLACEHOLDER);

	if (placeholderIndex === -1) {
		const content = template.trim() ? `${template}\n\n${replacement}` : replacement;
		return {
			content,
			cursor: indexToCaret(content, content.length),
		};
	}

	const content = template.split(PROMPT_PLACEHOLDER).join(replacement);
	const cursor = indexToCaret(content, placeholderIndex + replacement.length);

	return { content, cursor };
}

/**
 * Remove every `{prompt}` placeholder occurrence from the text.
 */
export function stripPlaceholder(text: string): string {
	return text.split(PROMPT_PLACEHOLDER).join('');
}

/**
 * Resolve the final prompt text for a launch: seed the template (filling the
 * `{prompt}` placeholder with `placeholderReplacement` when provided, otherwise
 * removing it), open it in `$EDITOR` (caret at the placeholder) for the user to
 * edit, and strip any remaining placeholder before returning. When `skipEditor`
 * is true, or no editor is available, the seeded template is used as-is.
 *
 * Shared by the background (`claude --bg`) and standard interactive launches.
 * Returns null when the user cancels the editor or the resulting prompt is empty.
 */
export function resolvePromptText(
	template: string,
	placeholderReplacement?: string,
	skipEditor = false
): string | null {
	const prepared =
		placeholderReplacement === undefined
			? preparePromptTemplate(template)
			: fillPromptTemplate(template, placeholderReplacement);

	if (!skipEditor && hasExternalEditor()) {
		const edited = openExternalEditor(prepared.content, {
			extension: '.md',
			prefix: 'grove-prompt-',
			cursor: prepared.cursor,
		});
		// Editor cancelled/failed
		if (edited === null) {
			return null;
		}
		const text = stripPlaceholder(edited).trim();
		return text || null;
	}

	// No editor available: fall back to the template text directly
	const text = prepared.content.trim();
	return text || null;
}
