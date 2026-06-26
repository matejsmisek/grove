import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { ISessionsService } from '../../storage/SessionsService.js';
import { ClaudeSessionService } from '../ClaudeSessionService.js';

// Mock filesystem
let vol: Volume;

vi.mock('fs', () => {
	return {
		default: new Proxy(
			{},
			{
				get(_target, prop) {
					return vol?.[prop as keyof Volume];
				},
			}
		),
		...Object.fromEntries(
			Object.getOwnPropertyNames(Volume.prototype)
				.filter((key) => key !== 'constructor')
				.map((key) => [key, (...args: unknown[]) => vol?.[key as keyof Volume]?.(...args)])
		),
	};
});

// Mock child_process so spawnCollect (used by archiveSession) is driven by fake
// child processes.
vi.mock('child_process', () => ({
	spawn: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
	})),
}));

const spawnMock = vi.mocked(spawn);

/**
 * Build a fake child process for the mocked `spawn`. Emits `close` on the next
 * microtask with the given exit code.
 */
function fakeProc(opts: { code?: number; stdout?: string }) {
	const proc = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: () => void;
	};
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	queueMicrotask(() => {
		if (opts.stdout) {
			proc.stdout.emit('data', Buffer.from(opts.stdout));
		}
		proc.emit('close', opts.code ?? 0);
	});
	return proc;
}

describe('ClaudeSessionService', () => {
	let service: ClaudeSessionService;
	let mockSessionsService: ISessionsService;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		mockSessionsService = {
			setSessionsPath: vi.fn(),
			readSessions: vi
				.fn()
				.mockReturnValue({ sessions: [], version: '1.0.0', lastUpdated: '2026-01-01T00:00:00Z' }),
			writeSessions: vi.fn(),
			addSession: vi.fn(),
			updateSession: vi.fn(),
			removeSession: vi.fn(),
			getSessionsByGrove: vi.fn().mockReturnValue([]),
			getSessionsByWorkspace: vi.fn().mockReturnValue([]),
			getSession: vi.fn().mockReturnValue(null),
			getAllActiveSessions: vi.fn().mockReturnValue([]),
			buildIndex: vi.fn(),
			cleanupStaleSessions: vi.fn().mockReturnValue(0),
		};

		service = new ClaudeSessionService(mockSessionsService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('isBackgroundSessionAlive', () => {
		const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

		afterEach(() => {
			if (originalConfigDir === undefined) {
				delete process.env.CLAUDE_CONFIG_DIR;
			} else {
				process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
			}
		});

		it('returns true when the session jobs directory exists', () => {
			process.env.CLAUDE_CONFIG_DIR = '/home/test/.claude';
			vol.mkdirSync('/home/test/.claude/jobs/abc123', { recursive: true });

			expect(service.isBackgroundSessionAlive('abc123')).toBe(true);
		});

		it('returns false when the session jobs directory is missing', () => {
			process.env.CLAUDE_CONFIG_DIR = '/home/test/.claude';
			expect(service.isBackgroundSessionAlive('missing')).toBe(false);
		});

		it('returns false for an empty session id', () => {
			expect(service.isBackgroundSessionAlive('')).toBe(false);
		});
	});

	describe('listTrackedSessions', () => {
		const registryEntry = (overrides: Record<string, unknown>) => ({
			sessionId: 'id',
			agentType: 'claude' as const,
			groveId: null,
			workspacePath: '/wt',
			worktreePath: null,
			status: 'active' as const,
			isRunning: true,
			lastUpdate: '2026-01-01T00:00:00Z',
			...overrides,
		});

		it('surfaces a suspended interactive session that is no longer live', async () => {
			// No live sessions reported by `claude agents --json`.
			spawnMock.mockImplementation(() => fakeProc({ stdout: '[]' }) as never);
			vi.mocked(mockSessionsService.readSessions).mockReturnValue({
				sessions: [
					registryEntry({
						sessionId: 'abc12345',
						kind: 'interactive',
						presence: 'suspended',
						isRunning: false,
						status: 'suspended',
						name: 'my-grove/app',
					}),
				],
				version: '1.0.0',
				lastUpdated: '2026-01-01T00:00:00Z',
			});

			const sessions = await service.listTrackedSessions();

			expect(sessions).toHaveLength(1);
			expect(sessions[0]).toMatchObject({
				sessionId: 'abc12345',
				kind: 'interactive',
				presence: 'suspended',
				status: 'suspended',
				name: 'my-grove/app',
				cwd: '/wt',
			});
		});

		it('does not surface an archived session', async () => {
			spawnMock.mockImplementation(() => fakeProc({ stdout: '[]' }) as never);
			vi.mocked(mockSessionsService.readSessions).mockReturnValue({
				sessions: [
					registryEntry({
						sessionId: 'abc12345',
						kind: 'interactive',
						presence: 'suspended',
						archived: true,
						isRunning: false,
						status: 'suspended',
					}),
				],
				version: '1.0.0',
				lastUpdated: '2026-01-01T00:00:00Z',
			});

			await expect(service.listTrackedSessions()).resolves.toEqual([]);
		});

		it('marks live sessions open and persists the reconciled registry', async () => {
			spawnMock.mockImplementation(
				() =>
					fakeProc({
						stdout: JSON.stringify([
							{ sessionId: 'live123', cwd: '/wt', kind: 'interactive', status: 'idle' },
						]),
					}) as never
			);
			vi.mocked(mockSessionsService.readSessions).mockReturnValue({
				sessions: [],
				version: '1.0.0',
				lastUpdated: '2026-01-01T00:00:00Z',
			});

			const sessions = await service.listTrackedSessions();

			expect(sessions).toHaveLength(1);
			expect(sessions[0]).toMatchObject({ sessionId: 'live123', presence: 'open', status: 'idle' });
			// The newly-seen live session is appended to the registry on disk.
			expect(mockSessionsService.writeSessions).toHaveBeenCalledWith(
				expect.objectContaining({
					sessions: expect.arrayContaining([
						expect.objectContaining({ sessionId: 'live123', presence: 'open', kind: 'interactive' }),
					]),
				})
			);
		});
	});

	describe('archiveSession', () => {
		it('runs `claude rm` and flags an existing registry entry archived', async () => {
			spawnMock.mockImplementation(() => fakeProc({ code: 0 }) as never);
			vi.mocked(mockSessionsService.getSession).mockReturnValue({
				sessionId: 'abc12345',
				agentType: 'claude',
				groveId: null,
				workspacePath: '',
				worktreePath: null,
				status: 'idle',
				isRunning: true,
				lastUpdate: '2026-01-01T00:00:00Z',
			});

			await service.archiveSession('abc12345');

			expect(spawnMock).toHaveBeenCalledWith(
				'claude',
				expect.arrayContaining(['rm']),
				expect.any(Object)
			);
			expect(mockSessionsService.updateSession).toHaveBeenCalledWith(
				'abc12345',
				expect.objectContaining({ archived: true, isRunning: false })
			);
		});

		it('adds an archived registry entry when none exists', async () => {
			spawnMock.mockImplementation(() => fakeProc({ code: 0 }) as never);
			vi.mocked(mockSessionsService.getSession).mockReturnValue(null);

			await service.archiveSession('zzz99999');

			expect(mockSessionsService.addSession).toHaveBeenCalledWith(
				expect.objectContaining({ sessionId: 'zzz99999', archived: true, isRunning: false })
			);
		});
	});
});
