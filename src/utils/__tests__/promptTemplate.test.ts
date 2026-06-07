import { describe, expect, it } from 'vitest';

import {
	PROMPT_PLACEHOLDER,
	fillPromptTemplate,
	preparePromptTemplate,
	stripPlaceholder,
} from '../promptTemplate.js';

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
});
