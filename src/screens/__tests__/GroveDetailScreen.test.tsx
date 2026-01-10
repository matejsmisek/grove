import { render } from 'ink-testing-library';
import path from 'path';
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
import { GroveDetailScreen } from '../GroveDetailScreen.js';

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
						// Return mock git output based on command
						if (args.includes('rev-parse')) {
							// Current branch
							setTimeout(() => callback(Buffer.from('main\n')), 0);
						} else if (args.includes('status')) {
							// File stats (clean status)
							setTimeout(
								() => callback(Buffer.from('## main...origin/main\n ?? untracked.txt\n')),
								0
							);
						} else if (args.includes('rev-list')) {
							// Unpushed commits (none)
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

describe('GroveDetailScreen - Visual Workflow', () => {
	beforeEach(() => {
		resetContainer();
		
		vol = new Volume();

		// Set up test environment
		const { groveFolder, workingFolder } = createTestEnvironment(vol);

		// Create test repositories
		const repo1 = new RepositoryBuilder('/repos/test-repo-1', 'test-repo-1');
		const repo2 = new RepositoryBuilder('/repos/test-repo-2', 'test-repo-2');

		repo1.createGitRepo(vol);
		repo2.createGitRepo(vol);

		new RepositoriesDataBuilder().addRepository(repo1).addRepository(repo2).writeTo(vol, groveFolder);

		// Create settings
		new SettingsBuilder(workingFolder)
			.withTerminal({ command: 'gnome-terminal', args: ['--working-directory', '{path}'] })
			.withSelectedIDE('vscode')
			.writeTo(vol, groveFolder);

		// Create a test grove with worktrees
		const groveBuilder = new GroveBuilder('test-grove-123', 'My Test Grove', workingFolder);
		groveBuilder
			.withCreatedAt('2024-01-01T00:00:00Z')
			.withUpdatedAt('2024-01-01T00:00:00Z')
			.addWorktree('test-repo-1', '/repos/test-repo-1', 'grove/my-test-grove')
			.addWorktree('test-repo-2', '/repos/test-repo-2', 'grove/my-test-grove');

		// Create grove in filesystem
		groveBuilder.createInFilesystem(vol);

		// Add grove to index
		const groveRef = new GroveReferenceBuilder('test-grove-123', 'My Test Grove', groveBuilder.getPath())
			.withCreatedAt('2024-01-01T00:00:00Z')
			.withUpdatedAt('2024-01-01T00:00:00Z');

		new GrovesIndexBuilder().addGrove(groveRef).writeTo(vol, groveFolder);

		// Write empty sessions file
		vol.writeFileSync(
			path.join(groveFolder, 'sessions.json'),
			JSON.stringify(
				{
					sessions: [],
					version: '1.0.0',
					lastUpdated: new Date().toISOString(),
				},
				null,
				'\t'
			)
		);

		// Register services
		registerServices(getContainer());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should display grove name and worktrees', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		// Wait for async data loading
		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('My Test Grove');
		expect(output).toContain('test-repo-1');
		expect(output).toContain('test-repo-2');
	});

	it('should display branch names for each worktree', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('main'); // Branch name from git command mock
	});

	it('should display file change statistics', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		// Should show some file stats (based on mock git status)
		expect(output).toMatch(/modified|added|deleted|untracked/i);
	});

	it('should show error when grove not found', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="nonexistent-grove" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('Grove not found');
	});

	it('should display worktree count', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('2'); // Should show 2 worktrees
	});

	it('should show actions menu options', async () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		// Should show available actions in the help text
		expect(output).toMatch(/enter|space|actions/i);
	});

	it('should handle monorepo worktrees with project paths', async () => {
		// Create a monorepo
		const monorepo = new RepositoryBuilder('/repos/monorepo', 'monorepo').asMonorepo();
		monorepo.createGitRepo(vol);
		monorepo.createProjects(vol, ['project-a']);

		const groveFolder = '/home/testuser/.grove';
		const workingFolder = '/home/testuser/grove-worktrees';

		// Create grove with monorepo worktree
		const groveBuilder = new GroveBuilder('monorepo-grove-456', 'Monorepo Grove', workingFolder);
		groveBuilder
			.withCreatedAt('2024-01-02T00:00:00Z')
			.addWorktree('monorepo', '/repos/monorepo', 'grove/monorepo-grove', 'project-a');

		groveBuilder.createInFilesystem(vol);

		// Add to index
		const groveRef = new GroveReferenceBuilder('monorepo-grove-456', 'Monorepo Grove', groveBuilder.getPath())
			.withCreatedAt('2024-01-02T00:00:00Z');

		new GrovesIndexBuilder().addGrove(groveRef).writeTo(vol, groveFolder);

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="monorepo-grove-456" />
				</NavigationProvider>
			</ServiceProvider>
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		const output = lastFrame()!;
		expect(output).toContain('monorepo');
		expect(output).toContain('project-a');
	});

	it('should display loading state initially', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<GroveDetailScreen groveId="test-grove-123" />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Loading');
	});
});
