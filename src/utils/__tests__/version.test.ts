import { describe, expect, it } from 'vitest';

import { UNKNOWN_VERSION, compareSemver, getAppVersion, isNewerVersion } from '../version.js';

describe('getAppVersion', () => {
	it('reads the hypergrove package.json version (semver shape)', () => {
		const version = getAppVersion();
		expect(version).not.toBe(UNKNOWN_VERSION);
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});
});

describe('compareSemver', () => {
	it('orders by major, then minor, then patch', () => {
		expect(compareSemver('1.2.0', '1.3.0')).toBe(-1);
		expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
		expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
		expect(compareSemver('1.2.10', '1.2.9')).toBe(1);
	});

	it('ignores a leading v and pre-release/build suffixes', () => {
		expect(compareSemver('v1.2.0', '1.2.0')).toBe(0);
		expect(compareSemver('1.2.0-beta.1', '1.2.0')).toBe(0);
		expect(compareSemver('1.2.0+build', '1.2.0')).toBe(0);
	});

	it('treats missing segments as zero', () => {
		expect(compareSemver('1', '1.0.0')).toBe(0);
		expect(compareSemver('1.2', '1.2.0')).toBe(0);
	});
});

describe('isNewerVersion', () => {
	it('is true only when latest is strictly greater than current', () => {
		expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true);
		expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
		expect(isNewerVersion('1.1.0', '1.2.0')).toBe(false);
	});

	it('never reports an update when either version is unknown', () => {
		expect(isNewerVersion(UNKNOWN_VERSION, '1.2.0')).toBe(false);
		expect(isNewerVersion('1.3.0', UNKNOWN_VERSION)).toBe(false);
	});
});
