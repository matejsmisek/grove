import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSessionName } from '../../utils/sessionName.js';
import { BackgroundSessionService } from '../BackgroundSessionService.js';
import type { ISessionTemplateService } from '../SessionTemplateService.js';

// Mock child_process so spawnCollect (used by dispatchBackgroundSession) is driven
// by fake child processes.
vi.mock('child_process', () => ({
	spawn: vi.fn(() => ({
		on: vi.fn(),
		unref: vi.fn(),
	})),
}));

// Pass direnv wrapping through unchanged so spawn assertions see the real argv.
vi.mock('../../utils/direnv.js', () => ({
	wrapSpawnWithDirenv: (_dir: string, command: string, args: string[]) => ({ command, args }),
	getDirenvWarning: () => undefined,
}));

const spawnMock = vi.mocked(spawn);

/**
 * Build a fake child process for the mocked `spawn`. Emits the given stdout/stderr
 * then `close` on the next microtask, or `error` when provided. When `hang` is set
 * it never settles (for timeout tests).
 */
function fakeProc(opts: {
	stdout?: string;
	stderr?: string;
	code?: number;
	error?: Error;
	hang?: boolean;
}) {
	const proc = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: () => void;
	};
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	if (!opts.hang) {
		queueMicrotask(() => {
			if (opts.error) {
				proc.emit('error', opts.error);
				return;
			}
			if (opts.stdout) {
				proc.stdout.emit('data', Buffer.from(opts.stdout));
			}
			if (opts.stderr) {
				proc.stderr.emit('data', Buffer.from(opts.stderr));
			}
			proc.emit('close', opts.code ?? 0);
		});
	}
	return proc;
}

describe('BackgroundSessionService', () => {
	let service: BackgroundSessionService;
	let mockTemplateService: ISessionTemplateService;

	beforeEach(() => {
		mockTemplateService = {
			getDefaultTemplate: vi.fn(),
			getEffectiveTemplate: vi.fn(),
			getTemplateForRepo: vi.fn(),
			getPromptTemplateForRepo: vi.fn(),
			applyTemplate: vi.fn(),
		};

		service = new BackgroundSessionService(mockTemplateService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('parseBackgroundSessionId', () => {
		const parse = (output: string): string | null =>
			(
				service as unknown as { parseBackgroundSessionId(o: string): string | null }
			).parseBackgroundSessionId(output);

		it('parses the short id from the backgrounded line', () => {
			const output = 'backgrounded · 7c5dcf5d · flaky-test-fix\n  claude attach 7c5dcf5d';
			expect(parse(output)).toBe('7c5dcf5d');
		});

		it('parses the id even with ANSI color codes', () => {
			const esc = String.fromCharCode(27);
			const output = `${esc}[32mbackgrounded${esc}[0m · ${esc}[1mab12cd34${esc}[0m · name`;
			expect(parse(output)).toBe('ab12cd34');
		});

		it('falls back to the claude attach hint line', () => {
			expect(parse('Started.\n  claude attach deadbeef    open in this terminal')).toBe('deadbeef');
		});

		it('returns null when no id is present', () => {
			expect(parse('something went wrong')).toBeNull();
		});
	});

	describe('buildSessionName', () => {
		const build = (repo: string, grove?: string, worktree?: string): string =>
			buildSessionName(repo, grove, worktree);

		it('joins grove and worktree names', () => {
			expect(build('/repos/app', 'my-grove', 'frontend')).toBe('my-grove/frontend');
		});

		it('falls back to the repo basename when no worktree name', () => {
			expect(build('/repos/app', 'my-grove')).toBe('my-grove/app');
		});

		it('uses the name once when grove and worktree names are identical', () => {
			expect(build('/repos/app', 'my-grove', 'my-grove')).toBe('my-grove');
		});

		it('truncates to 60 characters', () => {
			const long = 'g'.repeat(80);
			expect(build('/repos/app', long, 'wt').length).toBe(60);
		});
	});

	describe('dispatchBackgroundSession', () => {
		type Dispatched = { sessionId: string; warning?: string } | { errorMessage: string };
		const dispatch = (workingDir: string, name: string, prompt?: string): Promise<Dispatched> =>
			(
				service as unknown as {
					dispatchBackgroundSession(d: string, n: string, p?: string): Promise<Dispatched>;
				}
			).dispatchBackgroundSession(workingDir, name, prompt);

		it('spawns `claude --bg` and parses the session id from output', async () => {
			spawnMock.mockImplementation(
				() => fakeProc({ stdout: 'backgrounded · abc123 · my-name' }) as never
			);

			const result = await dispatch('/work', 'my-name');

			expect(result).toEqual({ sessionId: 'abc123', warning: undefined });
			expect(spawnMock).toHaveBeenCalledWith(
				'claude',
				['--bg', '--name', 'my-name'],
				expect.objectContaining({ cwd: '/work' })
			);
		});

		it('passes the prompt as a trailing argument when provided', async () => {
			spawnMock.mockImplementation(
				() => fakeProc({ stdout: 'backgrounded · def456 · my-name' }) as never
			);

			await dispatch('/work', 'my-name', 'do the thing');

			expect(spawnMock).toHaveBeenCalledWith(
				'claude',
				['--bg', '--name', 'my-name', 'do the thing'],
				expect.objectContaining({ cwd: '/work' })
			);
		});

		it('returns an error when the session id cannot be parsed', async () => {
			spawnMock.mockImplementation(() => fakeProc({ stdout: 'nothing useful here' }) as never);

			const result = await dispatch('/work', 'my-name');

			expect('errorMessage' in result && result.errorMessage).toContain(
				'could not determine the session ID'
			);
		});

		it('returns an error when spawn emits an error', async () => {
			spawnMock.mockImplementation(() => fakeProc({ error: new Error('ENOENT') }) as never);

			const result = await dispatch('/work', 'my-name');

			expect('errorMessage' in result && result.errorMessage).toContain('Failed to launch');
		});

		it('returns a timeout error and kills the process when it hangs', async () => {
			vi.useFakeTimers();
			const proc = fakeProc({ hang: true });
			spawnMock.mockImplementation(() => proc as never);

			const promise = dispatch('/work', 'my-name');
			await vi.advanceTimersByTimeAsync(30000);
			const result = await promise;

			expect(result).toEqual({ errorMessage: 'Timed out launching background session.' });
			expect((proc as unknown as { kill: () => void }).kill).toHaveBeenCalled();
			vi.useRealTimers();
		});
	});
});
