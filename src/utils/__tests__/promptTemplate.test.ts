import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	PROMPT_PLACEHOLDER,
	fillPromptTemplate,
	preparePromptTemplate,
	resolvePromptText,
	stripPlaceholder,
} from '../promptTemplate.js';

// Mock the external editor so resolvePromptText's editor branch is deterministic.
const { editorState } = vi.hoisted(() => ({
	editorState: { available: true, edited: null as string | null },
}));
vi.mock('../externalEditor.js', () => ({
	hasExternalEditor: vi.fn(() => editorState.available),
	openExternalEditor: vi.fn(() => editorState.edited),
}));

describe('promptTemplate', () => {
	describe('preparePromptTemplate', () => {
		it('removes the placeholder and reports its position on a single line', () => {
			const result = preparePromptTemplate(`Fix ${PROMPT_PLACEHOLDER} now`);

			expect(result.content).toBe('Fix  now');
			// "Fix " is 4 chars, so the placeholder started at column 5 on line 1
			expect(result.cursor).toEqual({ line: 1, column: 5 });
		});

		it('computes line and column for a placeholder on a later line', () => {
			const template = 'Context line one\nSecond: {prompt}';
			const result = preparePromptTemplate(template);

			expect(result.content).toBe('Context line one\nSecond: ');
			// "Second: " is 8 chars on line 2 → column 9
			expect(result.cursor).toEqual({ line: 2, column: 9 });
		});

		it('places caret at the very start when placeholder is first', () => {
			const result = preparePromptTemplate(`${PROMPT_PLACEHOLDER}\nrest`);

			expect(result.content).toBe('\nrest');
			expect(result.cursor).toEqual({ line: 1, column: 1 });
		});

		it('removes every placeholder occurrence but positions at the first', () => {
			const result = preparePromptTemplate(`a ${PROMPT_PLACEHOLDER} b ${PROMPT_PLACEHOLDER}`);

			expect(result.content).toBe('a  b ');
			expect(result.cursor).toEqual({ line: 1, column: 3 });
		});

		it('places caret at the end of content when no placeholder is present', () => {
			const result = preparePromptTemplate('line one\nline two');

			expect(result.content).toBe('line one\nline two');
			// last line "line two" is 8 chars → column 9
			expect(result.cursor).toEqual({ line: 2, column: 9 });
		});
	});

	describe('fillPromptTemplate', () => {
		it('replaces the placeholder with the replacement and positions the caret after it', () => {
			const result = fillPromptTemplate(`Before ${PROMPT_PLACEHOLDER} after`, 'TASK');

			expect(result.content).toBe('Before TASK after');
			// "Before " is 7 chars, replacement "TASK" ends at column 7 + 4 = 11 → caret column 12
			expect(result.cursor).toEqual({ line: 1, column: 12 });
		});

		it('replaces every placeholder occurrence', () => {
			const result = fillPromptTemplate(`${PROMPT_PLACEHOLDER} and ${PROMPT_PLACEHOLDER}`, 'X');

			expect(result.content).toBe('X and X');
		});

		it('appends the replacement when the template has no placeholder', () => {
			const result = fillPromptTemplate('Some context', 'TASK BODY');

			expect(result.content).toBe('Some context\n\nTASK BODY');
			// caret at end of content
			expect(result.cursor).toEqual({ line: 3, column: 10 });
		});

		it('returns just the replacement when the template is empty', () => {
			const result = fillPromptTemplate('', 'TASK BODY');

			expect(result.content).toBe('TASK BODY');
			expect(result.cursor).toEqual({ line: 1, column: 10 });
		});

		it('handles a multi-line replacement caret position', () => {
			const result = fillPromptTemplate(
				`Lead: ${PROMPT_PLACEHOLDER}`,
				'Task Name: T\n<description>D</description>'
			);

			expect(result.content).toBe('Lead: Task Name: T\n<description>D</description>');
			// caret ends at the end of the second replacement line (28 chars → column 29)
			expect(result.cursor).toEqual({ line: 2, column: 29 });
		});
	});

	describe('stripPlaceholder', () => {
		it('removes all placeholder occurrences', () => {
			expect(stripPlaceholder(`${PROMPT_PLACEHOLDER}hello${PROMPT_PLACEHOLDER}`)).toBe('hello');
		});

		it('leaves text without a placeholder unchanged', () => {
			expect(stripPlaceholder('no placeholder here')).toBe('no placeholder here');
		});
	});

	describe('resolvePromptText', () => {
		afterEach(() => {
			editorState.available = true;
			editorState.edited = null;
			vi.clearAllMocks();
		});

		it('returns the edited text when the editor is confirmed', () => {
			editorState.edited = '  Do the work  ';
			expect(resolvePromptText(`Lead: ${PROMPT_PLACEHOLDER}`, 'TASK')).toBe('Do the work');
		});

		it('returns null when the editor is cancelled', () => {
			editorState.edited = null;
			expect(resolvePromptText('Some template', 'TASK')).toBeNull();
		});

		it('returns null when the edited prompt is empty', () => {
			editorState.edited = '   \n  ';
			expect(resolvePromptText('Some template', 'TASK')).toBeNull();
		});

		it('strips any placeholder left behind by the user before returning', () => {
			editorState.edited = `Fix ${PROMPT_PLACEHOLDER} bug`;
			expect(resolvePromptText('template', 'TASK')).toBe('Fix  bug');
		});

		it('falls back to the seeded template when no editor is available', () => {
			editorState.available = false;
			expect(resolvePromptText(`Lead: ${PROMPT_PLACEHOLDER}`, 'TASK')).toBe('Lead: TASK');
		});

		it('uses the template directly (skipping the editor) when skipEditor is true', () => {
			editorState.edited = 'should not be used';
			expect(resolvePromptText(`Lead: ${PROMPT_PLACEHOLDER}`, 'TASK', true)).toBe('Lead: TASK');
		});

		it('removes the placeholder when no replacement is provided', () => {
			editorState.available = false;
			expect(resolvePromptText(`Fix ${PROMPT_PLACEHOLDER} now`)).toBe('Fix  now');
		});
	});
});
