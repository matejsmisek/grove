import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { IGroveConfigService } from '../../storage/GroveConfigService.js';
import type { IGrovesService } from '../../storage/GrovesService.js';
import type { ISettingsService } from '../../storage/SettingsService.js';
import type { IContextService } from '../ContextService.js';
import type { IFileService } from '../FileService.js';
import type { IGitService } from '../GitService.js';
import { GroveService } from '../GroveService.js';

let vol: Volume;

vi.mock('fs', () => ({
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
}));

// Keep init-action execution hermetic: never probe/run direnv.
vi.mock('../../utils/direnv.js', () => ({
	getDirenvAllowWarning: () => undefined,
	wrapSpawnWithDirenv: (_dir: string, command: string, args: string[]) => ({ command, args }),
}));

type CommandResult = { success: boolean; stdout: string; stderr: string; exitCode: number };

// Drive the private executeInitActions + stub the (spawn-based) command runner.
function callExecuteInitActions(
	service: GroveService,
	actions: string[],
	grovePath: string,
	worktreeName: string,
	worktreePath: string,
	results: CommandResult[]
) {
	const queue = [...results];
	vi
		.spyOn(service as unknown as { executeCommand: () => Promise<CommandResult> }, 'executeCommand')
		.mockImplementation(() =>
			Promise.resolve(queue.shift() ?? { success: true, stdout: '', stderr: '', exitCode: 0 })
		);
	return (
		service as unknown as {
			executeInitActions(
				a: string[],
				g: string,
				wn: string,
				wp: string
			): Promise<{ success: boolean; logFile: string; successfulActions?: number }>;
		}
	).executeInitActions(actions, grovePath, worktreeName, worktreePath);
}

describe('GroveService.executeInitActions (async log writes)', () => {
	let service: GroveService;
	const grovePath = '/groves/g1';
	const logPath = `${grovePath}/grove-init-wt.log`;

	beforeEach(() => {
		const mockFs = createMockFs();
		vol = mockFs.vol;
		vol.mkdirSync(grovePath, { recursive: true });

		service = new GroveService(
			{} as unknown as ISettingsService,
			{} as unknown as IGrovesService,
			{} as unknown as IGroveConfigService,
			{} as unknown as IGitService,
			{} as unknown as IContextService,
			{} as unknown as IFileService
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('writes a log with the header, command output, and a SUCCESS summary', async () => {
		const status = await callExecuteInitActions(
			service,
			['echo hello'],
			grovePath,
			'wt',
			'/worktrees/wt',
			[{ success: true, stdout: 'hello', stderr: '', exitCode: 0 }]
		);

		expect(status.success).toBe(true);
		expect(vol.existsSync(logPath)).toBe(true);

		const log = vol.readFileSync(logPath, 'utf-8') as string;
		expect(log).toContain('Grove InitActions Execution Log');
		expect(log).toContain('[Action 1/1] echo hello');
		expect(log).toContain('STDOUT:\nhello');
		expect(log).toContain('Status: SUCCESS');
	});

	it('stops on the first failing action and records FAILED in the log', async () => {
		const status = await callExecuteInitActions(
			service,
			['ok', 'boom', 'never'],
			grovePath,
			'wt',
			'/worktrees/wt',
			[
				{ success: true, stdout: '', stderr: '', exitCode: 0 },
				{ success: false, stdout: '', stderr: 'nope', exitCode: 1 },
			]
		);

		expect(status.success).toBe(false);

		const log = vol.readFileSync(logPath, 'utf-8') as string;
		expect(log).toContain('EXECUTION STOPPED');
		expect(log).toContain('Status: FAILED');
		// The third action must never have been logged (execution stopped at #2).
		expect(log).not.toContain('[Action 3/3]');
	});
});
