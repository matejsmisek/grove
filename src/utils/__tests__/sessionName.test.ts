import { describe, expect, it } from 'vitest';

import { buildSessionName, shellQuoteArg } from '../sessionName.js';

describe('buildSessionName', () => {
	it('joins grove and worktree names', () => {
		expect(buildSessionName('/repos/app', 'my-grove', 'frontend')).toBe('my-grove/frontend');
	});

	it('falls back to the repo basename when no worktree name', () => {
		expect(buildSessionName('/repos/app', 'my-grove')).toBe('my-grove/app');
	});

	it('uses the name once when grove and worktree names are identical', () => {
		expect(buildSessionName('/repos/app', 'my-grove', 'my-grove')).toBe('my-grove');
	});

	it('falls back to a generic label with no names', () => {
		expect(buildSessionName('')).toBe('grove-session');
	});

	it('truncates to 60 characters', () => {
		expect(buildSessionName('/repos/app', 'g'.repeat(80), 'wt').length).toBe(60);
	});
});

describe('shellQuoteArg', () => {
	it('wraps a plain value in single quotes', () => {
		expect(shellQuoteArg('my-grove/frontend')).toBe(`'my-grove/frontend'`);
	});

	it('escapes embedded single quotes', () => {
		expect(shellQuoteArg("it's")).toBe(`'it'\\''s'`);
	});
});
