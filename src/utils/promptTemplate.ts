/**
 * Helpers for the launch-time prompt template.
 *
 * A prompt template is freeform text that prefills Claude's initial prompt when
 * launching a new session. It may contain the literal placeholder `{prompt}`
 * which marks where the editor caret should be placed; the placeholder itself is
 * removed before the text is opened in the editor (and again before launching, in
 * case the user re-typed it).
 */

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
 * Remove every `{prompt}` placeholder occurrence from the text.
 */
export function stripPlaceholder(text: string): string {
	return text.split(PROMPT_PLACEHOLDER).join('');
}
