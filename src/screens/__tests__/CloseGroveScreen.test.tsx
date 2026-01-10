import { render } from 'ink-testing-library';
import React from 'react';
import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createTestEnvironment,
	GroveBuilder,
	GrovesIndexBuilder,
	GroveReferenceBuilder,
	RepositoriesDataBuilder,
	RepositoryBuilder,
	SettingsBuilder,
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
} = {
	hasUncommittedChanges: false,
	hasUnpushedCommits: false,
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
	spawn: vi.fn((command: string, args: string[]) => {
		const mockEmitter = {
			stdout: {
				on: vi.fn((event: string, callback: (data: Buffer) => void) => {
					if (event === 'data') {
						// Mock uncommitted changes check (git status --porcelain)
						if (args.includes('--porcelain') || args.includes('status')) {
							if (gitMockResponses.hasUncommittedChanges) {
								setTimeout(() => callback(Buffer.from(' M modified-file.ts\n')), 0);
							} else {
								setTimeout(() => callback(Buffer.from('')), 0);
							}
						}
						// Mock unpushed commits check (git rev-list)
						else if (args.includes('rev-list')) {
							if (gitMockResponses.hasUnpushedCommits) {
								setTimeout(() => callback(Buffer.from('1\n')), 0);
							} else {
								setTimeout(() => callback(Buffer.from('0\n')), 0);
							}
						}
						// Mock git branch -r --contains (check if commit is on remote)
						else if (args.includes('branch') && args.includes('-r')) {
							if (gitMockResponses.hasUnpushedCommits) {
								// No remote branches contain this commit
								setTimeout(() => callback(Buffer.from('')), 0);
							} else {
								// Remote branch contains this commit
								setTimeout(() => callback(Buffer.from('  origin/main\n')), 0);
							}
						}
						// Mock git rev-parse HEAD (return a commit hash)
						else if (args.includes('rev-parse') && args.includes('HEAD')) {
							setTimeout(() => callback(Buffer.from('abc123def456\n')), 0);
						}
						// Default: return empty (no upstream)
						else {
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
		};

		// Set up test environment
		const { groveFolder, workingFolder } = createTestEnvironment(vol);

		// Create test repositories
		const repo1 = new RepositoryBuilder('/repos/test-repo-1', 'test-repo-1');
		repo1.createGitRepo(vol);

		new RepositoriesDataBuilder().addRepository(repo1).writeTo(vol, groveFolder);

		// Create settings
		new SettingsBuilder(workingFolder)
			.withTerminal({ command: 'gnome-terminal', args: ['--working-directory', '{path}'] })
			.withSelectedIDE('vscode')
			.writeTo(vol, groveFolder);

		// Create a test grove
		const groveBuilder = new GroveBuilder('test-grove-123', 'Test Grove', workingFolder);
		groveBuilder
			.withCreatedAt('2024-01-01T00:00:00Z')
			.addWorktree('test-repo-1', '/repos/test-repo-1', 'grove/test-grove');

		groveBuilder.createInFilesystem(vol);

		// Add grove to index
		const groveRef = new GroveReferenceBuilder('test-grove-123', 'Test Grove', groveBuilder.getPath())
			.withCreatedAt('2024-01-01T00:00:00Z');

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

		// Wait for async checks to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

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

		await new Promise((resolve) => setTimeout(resolve, 100));

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

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('✓ All safety checks passed.');
		expect(output).toContain('Uncommitted changes: ✓ No');
		expect(output).toContain('Unpushed commits: ✓ No');
	});

	it('should show warning when there are uncommitted changes', async () => {
		// Set mock to return uncommitted changes
		gitMockResponses.hasUncommittedChanges = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('Uncommitted changes: ⚠ Yes');
	});

	it('should show warning when there are unpushed commits', async () => {
		// Set mock to return unpushed commits
		gitMockResponses.hasUnpushedCommits = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('Unpushed commits: ⚠ Yes');
	});

	it('should require typing "delete" when issues detected', async () => {
		// Set mock to return uncommitted changes
		gitMockResponses.hasUncommittedChanges = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('Type "delete" to confirm deletion:');
	});

	it('should show both warnings when both issues detected', async () => {
		// Set mock to return both issues
		gitMockResponses.hasUncommittedChanges = true;
		gitMockResponses.hasUnpushedCommits = true;

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

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

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('Error: Grove not found');
	});

	it('should list all worktrees being checked', async () => {
		// Create a grove with multiple worktrees
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

		const groveRef = new GroveReferenceBuilder('multi-grove-456', 'Multi Grove', groveBuilder.getPath())
			.withCreatedAt('2024-01-02T00:00:00Z');

		new GrovesIndexBuilder().addGrove(groveRef).writeTo(vol, groveFolder);

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CloseGroveScreen groveId="multi-grove-456" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

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

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('⚠ Warning: This grove has uncommitted changes or unpushed commits.');
	});
});
