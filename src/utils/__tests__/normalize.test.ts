import { describe, expect, it } from 'vitest';

import { generateGroveIdentifier, normalizeGroveName, normalizeName } from '../normalize.js';

describe('generateGroveIdentifier', () => {
	it('produces a 5-character lowercase alphanumeric identifier', () => {
		const id = generateGroveIdentifier('My Grove');
		expect(id).toMatch(/^[a-z0-9]{5}$/);
	});

	it('never contains underscores or hyphens for any input', () => {
		// base64url (the previous encoding) could emit '-' and '_'; hex cannot.
		const names = [
			'',
			'a',
			'feature/login',
			'Some Long Name With Spaces',
			'symbols!@#$%^&*()',
			'12345',
			'грув',
			'a'.repeat(200),
		];
		for (const name of names) {
			const id = generateGroveIdentifier(name);
			expect(id).toMatch(/^[a-z0-9]{5}$/);
		}
	});

	it('is deterministic for the same input', () => {
		expect(generateGroveIdentifier('repeat')).toBe(generateGroveIdentifier('repeat'));
	});
});

describe('normalizeGroveName', () => {
	it('never ends with an underscore or hyphen', () => {
		const names = ['My Grove', 'trailing_', 'weird__name__', 'a/b/c'];
		for (const name of names) {
			const slug = normalizeGroveName(name, generateGroveIdentifier(name));
			expect(slug).not.toMatch(/[_-]$/);
			expect(slug).toMatch(/^[a-z0-9-]+$/);
		}
	});
});

describe('normalizeName', () => {
	it('strips invalid characters and lowercases', () => {
		expect(normalizeName('Feature: Login!')).toBe('feature-login');
	});
});
