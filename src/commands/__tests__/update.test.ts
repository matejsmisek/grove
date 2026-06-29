import { describe, expect, it, vi } from 'vitest';

import type { IUpdateService } from '../../services/UpdateService.js';
import { checkForUpdate } from '../update.js';

function mockUpdateService(current: string, latest: string | null): IUpdateService {
	return {
		getCurrentVersion: vi.fn().mockReturnValue(current),
		getLatestVersion: vi.fn().mockResolvedValue(latest),
	};
}

describe('checkForUpdate', () => {
	it('reports an available update with the exact-version install command', async () => {
		const result = await checkForUpdate(mockUpdateService('1.2.0', '1.3.0'));

		expect(result.success).toBe(true);
		expect(result.updateAvailable).toBe(true);
		expect(result.latest).toBe('1.3.0');
		expect(result.installCommand).toBe('npm install -g hypergrove@1.3.0');
		expect(result.lines).toContain('Update available: Grove v1.2.0 → v1.3.0');
		expect(result.lines).toContain('  npm install -g hypergrove@1.3.0');
	});

	it('reports up to date when already on the latest version', async () => {
		const result = await checkForUpdate(mockUpdateService('1.3.0', '1.3.0'));

		expect(result.success).toBe(true);
		expect(result.updateAvailable).toBe(false);
		expect(result.lines).toEqual(['Grove v1.3.0 is up to date (latest: v1.3.0).']);
	});

	it('does not offer an update when the installed version is newer than latest', async () => {
		const result = await checkForUpdate(mockUpdateService('1.4.0', '1.3.0'));

		expect(result.updateAvailable).toBe(false);
	});

	it('forces a fresh registry check (bypasses the cache)', async () => {
		const service = mockUpdateService('1.2.0', '1.3.0');
		await checkForUpdate(service);
		expect(service.getLatestVersion).toHaveBeenCalledWith({ force: true });
	});

	it('falls back to @latest and fails when the registry is unreachable', async () => {
		const result = await checkForUpdate(mockUpdateService('1.2.0', null));

		expect(result.success).toBe(false);
		expect(result.updateAvailable).toBe(false);
		expect(result.installCommand).toBe('npm install -g hypergrove@latest');
		expect(result.lines.some((l) => l.includes('Could not check for updates'))).toBe(true);
	});
});
