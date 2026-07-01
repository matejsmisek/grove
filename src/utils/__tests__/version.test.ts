import { describe, expect, it } from 'vitest';

import {
	UNKNOWN_VERSION,
	UPDATE_NOTIFY_COOLDOWN_MS,
	compareSemver,
	getAppVersion,
	isNewerVersion,
	shouldShowUpdateNotification,
} from '../version.js';

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

describe('shouldShowUpdateNotification', () => {
	const NOW = 1_000_000_000_000;

	it('does not show when there is no newer version', () => {
		expect(
			shouldShowUpdateNotification({
				current: '1.3.0',
				latest: '1.3.0',
				dismissedVersion: null,
				dismissedAt: null,
				now: NOW,
			})
		).toBe(false);
	});

	it('does not show when latest is unknown (offline)', () => {
		expect(
			shouldShowUpdateNotification({
				current: '1.2.0',
				latest: null,
				dismissedVersion: null,
				dismissedAt: null,
				now: NOW,
			})
		).toBe(false);
	});

	it('shows an available update that was never dismissed', () => {
		expect(
			shouldShowUpdateNotification({
				current: '1.2.0',
				latest: '1.3.0',
				dismissedVersion: null,
				dismissedAt: null,
				now: NOW,
			})
		).toBe(true);
	});

	it('stays snoozed within the 7-day cooldown for the dismissed version', () => {
		expect(
			shouldShowUpdateNotification({
				current: '1.2.0',
				latest: '1.3.0',
				dismissedVersion: '1.3.0',
				dismissedAt: NOW - (UPDATE_NOTIFY_COOLDOWN_MS - 1),
				now: NOW,
			})
		).toBe(false);
	});

	it('shows again once the cooldown elapses for the same version', () => {
		expect(
			shouldShowUpdateNotification({
				current: '1.2.0',
				latest: '1.3.0',
				dismissedVersion: '1.3.0',
				dismissedAt: NOW - UPDATE_NOTIFY_COOLDOWN_MS,
				now: NOW,
			})
		).toBe(true);
	});

	it('shows immediately when a newer version ships during the cooldown', () => {
		expect(
			shouldShowUpdateNotification({
				current: '1.2.0',
				latest: '1.4.0',
				dismissedVersion: '1.3.0',
				dismissedAt: NOW - 1000,
				now: NOW,
			})
		).toBe(true);
	});
});
