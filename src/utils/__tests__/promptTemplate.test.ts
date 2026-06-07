import { describe, expect, it } from 'vitest';

import { PROMPT_PLACEHOLDER, preparePromptTemplate, stripPlaceholder } from '../promptTemplate.js';

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

	describe('stripPlaceholder', () => {
		it('removes all placeholder occurrences', () => {
			expect(stripPlaceholder(`${PROMPT_PLACEHOLDER}hello${PROMPT_PLACEHOLDER}`)).toBe('hello');
		});

		it('leaves text without a placeholder unchanged', () => {
			expect(stripPlaceholder('no placeholder here')).toBe('no placeholder here');
		});
	});
});
