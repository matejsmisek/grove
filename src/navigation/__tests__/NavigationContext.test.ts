import { describe, expect, it } from 'vitest';

import { unwindHistoryToHome } from '../NavigationContext.js';
import type { NavigationState } from '../types.js';

describe('unwindHistoryToHome', () => {
	it('unwinds to the existing home entry and discards screens stacked above it', () => {
		// Reproduces the "Grove not found" bug: after closing a grove, history still
		// holds the grove screens. Returning to home must drop them so a later
		// goBack() lands on the workspace list (globalHome), not a stale grove screen.
		const history: NavigationState[] = [
			{ screen: 'globalHome', params: { selectedLocationPath: '/ws' } },
			{ screen: 'home', params: { selectedGroveId: 'g1' } },
			{ screen: 'groveDetail', params: { groveId: 'g1' } },
			{ screen: 'closeGrove', params: { groveId: 'g1' } },
		];

		const result = unwindHistoryToHome(history);

		expect(result.current).toEqual({ screen: 'home', params: { selectedGroveId: 'g1' } });
		// Only the workspace list remains below home, so Esc exits cleanly.
		expect(result.history).toEqual([
			{ screen: 'globalHome', params: { selectedLocationPath: '/ws' } },
		]);
	});

	it('unwinds to the most recent home when several are present', () => {
		const history: NavigationState[] = [
			{ screen: 'home', params: {} },
			{ screen: 'groveDetail', params: { groveId: 'g1' } },
			{ screen: 'home', params: { selectedGroveId: 'g2' } },
			{ screen: 'groveDetail', params: { groveId: 'g2' } },
			{ screen: 'closeGrove', params: { groveId: 'g2' } },
		];

		const result = unwindHistoryToHome(history);

		expect(result.current).toEqual({ screen: 'home', params: { selectedGroveId: 'g2' } });
		expect(result.history).toEqual([
			{ screen: 'home', params: {} },
			{ screen: 'groveDetail', params: { groveId: 'g1' } },
		]);
	});

	it('falls back to a fresh home with an empty stack when no home exists', () => {
		const history: NavigationState[] = [
			{ screen: 'groveDetail', params: { groveId: 'g1' } },
			{ screen: 'closeGrove', params: { groveId: 'g1' } },
		];

		const result = unwindHistoryToHome(history);

		expect(result.current).toEqual({ screen: 'home', params: {} });
		expect(result.history).toEqual([]);
	});

	it('falls back to a fresh home for an empty history', () => {
		const result = unwindHistoryToHome([]);

		expect(result.current).toEqual({ screen: 'home', params: {} });
		expect(result.history).toEqual([]);
	});
});
