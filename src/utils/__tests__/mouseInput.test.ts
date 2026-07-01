import { describe, expect, it } from 'vitest';

import { ESC, interpretModalKey, stripMouseReports } from '../mouseInput.js';

/** An SGR (mode 1006) mouse report, e.g. a motion event. */
function sgr(button: number, x: number, y: number, release = false): string {
	return `${ESC}[<${button};${x};${y}${release ? 'm' : 'M'}`;
}

describe('stripMouseReports', () => {
	it('removes SGR mouse reports', () => {
		expect(stripMouseReports(sgr(35, 10, 20))).toBe('');
		expect(stripMouseReports(sgr(0, 1, 1, true))).toBe('');
		expect(stripMouseReports(sgr(35, 1, 1) + sgr(35, 2, 2))).toBe('');
	});

	it('keeps a real keypress that was batched with a mouse report', () => {
		expect(stripMouseReports(sgr(35, 10, 20) + ESC)).toBe(ESC);
		expect(stripMouseReports(sgr(35, 5, 5) + '\r')).toBe('\r');
	});

	it('leaves non-mouse input untouched', () => {
		expect(stripMouseReports(ESC)).toBe(ESC);
		expect(stripMouseReports('\r')).toBe('\r');
		expect(stripMouseReports(`${ESC}[A`)).toBe(`${ESC}[A`); // arrow key, not a mouse report
	});
});

describe('interpretModalKey', () => {
	it('trusts Ink parsed keys for clean presses', () => {
		expect(interpretModalKey('', { escape: true })).toEqual({ escape: true, enter: false });
		expect(interpretModalKey('\r', { return: true })).toEqual({ escape: false, enter: true });
	});

	it('recovers Esc/Enter batched with mouse motion (Ink parsed them false)', () => {
		expect(interpretModalKey(sgr(35, 10, 20) + ESC, {})).toEqual({ escape: true, enter: false });
		expect(interpretModalKey(sgr(35, 5, 5) + '\r', {})).toEqual({ escape: false, enter: true });
		expect(interpretModalKey(ESC + sgr(35, 1, 1), {})).toEqual({ escape: true, enter: false });
	});

	it('ignores pure mouse motion (does not dismiss or copy)', () => {
		expect(interpretModalKey(sgr(35, 10, 20), {})).toEqual({ escape: false, enter: false });
		expect(interpretModalKey(sgr(64, 3, 3), {})).toEqual({ escape: false, enter: false }); // wheel
		expect(interpretModalKey(sgr(35, 1, 1) + sgr(35, 2, 2), {})).toEqual({
			escape: false,
			enter: false,
		});
	});

	it('treats a bare newline as Enter', () => {
		expect(interpretModalKey('\n', {})).toEqual({ escape: false, enter: true });
	});
});
