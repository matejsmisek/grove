import React from 'react';

import { render } from 'ink-testing-library';
import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	GroveBuilder,
	GroveReferenceBuilder,
	GrovesIndexBuilder,
	RepositoriesDataBuilder,
	RepositoryBuilder,
	SettingsBuilder,
	createTestEnvironment,
} from '../../__tests__/builders.js';
import { getContainer, resetContainer } from '../../di/Container.js';
import { ServiceProvider } from '../../di/ServiceContext.js';
import { NavigationProvider } from '../../navigation/NavigationContext.js';
import { registerServices } from '../../services/registration.js';
import { CloseGroveScreen } from '../CloseGroveScreen.js';

// Mock filesystem
let vol: Volume;

// Mock git status responses
let gitMockResponses: {
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
	upstreamStatus: 'gone' | 'active' | 'none';
} = {
	hasUncommittedChanges: false,
	hasUnpushedCommits: false,
	upstreamStatus: 'gone',
};

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

vi.mock('os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

// Mock child_process for git commands
vi.mock('child_process', () => ({
	spawn: vi.fn((_command: string, args: string[]) => {
		const mockEmitter = {
			stdout: {
				on: vi.fn((event: string, callback: (data: Buffer) => void) => {
					if (event === 'data') {
						if (args.includes('--porcelain') || args.includes('status')) {
							// Mock uncommitted changes check (git status --porcelain)
							if (gitMockResponses.hasUncommittedChanges) {
								setTimeout(() => callback(Buffer.from(' M modified-file.ts\n')), 0);
							} else {
								setTimeout(() => callback(Buffer.from('')), 0);
							}
						} else if (args.includes('branch') && args.includes('-vv')) {
							// Mock git branch -vv (getBranchUpstreamStatus)
							const status = gitMockResponses.upstreamStatus;
							if (status === 'gone') {
								setTimeout(
									() => callback(Buffer.from('* main abc123 [origin/main: gone] merged commit\n')),
									0
								);
							} else if (status === 'active') {
								setTimeout(() => callback(Buffer.from('* main abc123 [origin/main] active commit\n')), 0);
							} else {
								setTimeout(() => callback(Buffer.from('* main abc123 local commit\n')), 0);
							}
						} else if (args.includes('branch') && args.includes('-r')) {
							// Mock git branch -r --contains (check if commit is on remote)
							if (gitMockResponses.hasUnpushedCommits) {
								setTimeout(() => callback(Buffer.from('')), 0);
							} else {
								setTimeout(() => callback(Buffer.from('  origin/main\n')), 0);
							}
						} else if (args.includes('rev-list')) {
							// Mock unpushed commits check (git rev-list)
							if (gitMockResponses.hasUnpushedCommits) {
								setTimeout(() => callback(Buffer.from('1\n')), 0);
							} else {
								setTimeout(() => callback(Buffer.from('0\n')), 0);
							}
						} else if (args.includes('rev-parse') && args.includes('--abbrev-ref')) {
							// Mock git rev-parse --abbrev-ref HEAD (current branch name)
							setTimeout(() => callback(Buffer.from('main\n')), 0);
						} else if (args.includes('rev-parse') && args.includes('HEAD')) {
							// Mock git rev-parse HEAD (return a commit hash)
							setTimeout(() => callback(Buffer.from('abc123def456\n')), 0);
						} else {
							// Default: return empty
							setTimeout(() => callback(Buffer.from('')), 0);
						}
					}
				}),
			},
			stderr: {
				on: vi.fn(),
			},
			on: vi.fn((event: string, callback: (code: number) => void) => {
				if (event === 'close') {
					setTimeout(() => callback(0), 0);
				}
			}),
		};
		return mockEmitter;
	}),
}));

describe('CloseGroveScreen - Visual Workflow', () => {
	beforeEach(() => {
		resetContainer();
		vol = new Volume();

		// Reset git mock responses to clean state
		gitMockResponses = {
			hasUncommittedChanges: false,
			hasUnpushedCommits: false,
			upstreamStatus: 'gone',
		};

		// Set up test environment
		const { groveFolder, workingFolder } = createTestEnvironment(vol);

		// Create test repositories
		const repo1 = new RepositoryBuilder('/repos/test-repo-1', 'test-repo-1');
		repo1.createGitRepo(vol);

		new RepositoriesDataBuilder().addRepository(repo1).writeTo(vol, groveFolder);

		// Create settings
		new SettingsBuilder(workingFolder)
			.withTerminal({
				command: 'gnome-terminal',
				args: ['--working-directory', '{path}'],
			})
			.withSelectedIDE('vscode')
			.writeTo(vol, groveFolder);

		// Create a test grove
		const groveBuilder = new GroveBuilder('test-grove-123', 'Test Grove', workingFolder);
		groveBuilder
			.withCreatedAt('2024-01-01T00:00:00Z')
			.addWorktree('test-repo-1', '/repos/test-repo-1', 'grove/test-grove');

		groveBuilder.createInFilesystem(vol);

		// Add grove to index
		const groveRef = new GroveReferenceBuilder(
			'test-grove-123',
			'Test Grove',
			groveBuilder.getPath()
		).withCreatedAt('2024-01-01T00:00:00Z');

		new GrovesIndexBuilder().addGrove(groveRef).writeTo(vol, groveFolder);

		// Register services
		registerServices(getContainer());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should display loading state initially', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Loading grove information...');
	});

	it('should display grove name', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Close Grove: Test Grove');
	});

	it('should show simple Y/N confirmation when no issues detected', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Press Y to confirm or N to cancel');
		expect(output).toContain('test-repo-1');
	});

	it('should show clean status indicators when no issues', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('✓ All branches are merged and clean.');
		expect(output).toContain('Uncommitted changes: ✓ No');
		expect(output).toContain('Unpushed commits: ✓ No');
		expect(output).toContain('Branch status: ✓ Merged');
	});

	it('should show warning when there are uncommitted changes', async () => {
		gitMockResponses.hasUncommittedChanges = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Uncommitted changes: ⚠ Yes');
	});

	it('should show warning when there are unpushed commits', async () => {
		// Upstream must be 'active' for unpushed check to run (gone = short-circuits to false)
		gitMockResponses.hasUnpushedCommits = true;
		gitMockResponses.upstreamStatus = 'active';

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Unpushed commits: ⚠ Yes');
	});

	it('should require typing "delete" when issues detected', async () => {
		gitMockResponses.hasUncommittedChanges = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Type "delete" to confirm deletion:');
	});

	it('should show both warnings when both issues detected', async () => {
		// Upstream must be 'active' for unpushed check to run
		gitMockResponses.hasUncommittedChanges = true;
		gitMockResponses.hasUnpushedCommits = true;
		gitMockResponses.upstreamStatus = 'active';

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Uncommitted changes: ⚠ Yes');
		expect(output).toContain('Unpushed commits: ⚠ Yes');
	});

	it('should show error when grove not found', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="nonexistent-grove" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Error: Grove not found');
	});

	it('should list all worktrees being checked', async () => {
		const groveFolder = '/home/testuser/.grove';
		const workingFolder = '/home/testuser/grove-worktrees';

		const repo2 = new RepositoryBuilder('/repos/test-repo-2', 'test-repo-2');
		repo2.createGitRepo(vol);

		const groveBuilder = new GroveBuilder('multi-grove-456', 'Multi Grove', workingFolder);
		groveBuilder
			.withCreatedAt('2024-01-02T00:00:00Z')
			.addWorktree('test-repo-1', '/repos/test-repo-1', 'grove/multi-grove')
			.addWorktree('test-repo-2', '/repos/test-repo-2', 'grove/multi-grove');

		groveBuilder.createInFilesystem(vol);

		const groveRef = new GroveReferenceBuilder(
			'multi-grove-456',
			'Multi Grove',
			groveBuilder.getPath()
		).withCreatedAt('2024-01-02T00:00:00Z');

		new GrovesIndexBuilder().addGrove(groveRef).writeTo(vol, groveFolder);

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="multi-grove-456" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('test-repo-1');
		expect(output).toContain('test-repo-2');
	});

	it('should show danger warning when issues exist', async () => {
		gitMockResponses.hasUncommittedChanges = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('⚠ Warning: This grove has unfinished work.');
	});

	it('should show branch status as not merged when upstream is active', async () => {
		gitMockResponses.upstreamStatus = 'active';

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Branch status: ⚠ Not merged');
		expect(output).toContain('Type "delete" to confirm deletion:');
	});

	it('should show branch status as no upstream when none configured', async () => {
		gitMockResponses.upstreamStatus = 'none';

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = lastFrame()!;
		expect(output).toContain('Branch status: ⚠ No upstream');
		expect(output).toContain('Type "delete" to confirm deletion:');
	});
});
