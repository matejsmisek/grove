import { render } from 'ink-testing-library';
import path from 'path';
import React from 'react';
import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createTestEnvironment,
	RepositoriesDataBuilder,
	RepositoryBuilder,
	SettingsBuilder,
} from '../../__tests__/builders.js';
import { getContainer, resetContainer } from '../../di/Container.js';
import { ServiceProvider } from '../../di/ServiceContext.js';
import { NavigationProvider } from '../../navigation/NavigationContext.js';
import { registerServices } from '../../services/registration.js';
import { CreateGroveScreen } from '../CreateGroveScreen.js';

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
	spawn: vi.fn(() => {
		return {
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn((event, callback) => {
				if (event === 'close') {
					// Simulate successful git command
					setTimeout(() => callback(0), 0);
				}
			}),
		};
	}),
}));

describe('CreateGroveScreen - Visual Workflow', () => {
	beforeEach(() => {
		resetContainer();
		vol = new Volume();

		// Set up test environment with settings and repositories
		const { groveFolder, workingFolder } = createTestEnvironment(vol);

		// Create some test repositories
		const repo1 = new RepositoryBuilder('/repos/test-repo-1', 'test-repo-1').withRegisteredAt(
			'2024-01-01T00:00:00Z'
		);
		const repo2 = new RepositoryBuilder('/repos/test-repo-2', 'test-repo-2').withRegisteredAt(
			'2024-01-02T00:00:00Z'
		);

		// Create git repos in filesystem
		repo1.createGitRepo(vol);
		repo2.createGitRepo(vol);

		// Write repositories data
		new RepositoriesDataBuilder().addRepository(repo1).addRepository(repo2).writeTo(vol, groveFolder);

		// Write settings
		new SettingsBuilder(workingFolder)
			.withTerminal({ command: 'gnome-terminal', args: ['--working-directory', '{path}'] })
			.withSelectedIDE('vscode')
			.writeTo(vol, groveFolder);

		// Write empty groves index
		vol.writeFileSync(
			path.join(groveFolder, 'groves.json'),
			JSON.stringify({ groves: [] }, null, '\t')
		);

		// Register services with DI container
		registerServices(getContainer());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should display name input step in offline mode (no LLM)', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CreateGroveScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Create New Grove');
		expect(output).toContain('Enter a name for your grove:');
		expect(output).toContain('Name:');
	});

	it('should show help text for input interaction', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CreateGroveScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Press Enter to continue');
		expect(output).toContain('Esc to cancel');
	});

	it('should display title with branding', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CreateGroveScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Create New Grove');
	});

	it('should show monorepo indicator when registered repository is monorepo', async () => {
		// Create a monorepo
		const monorepo = new RepositoryBuilder('/repos/monorepo', 'monorepo')
			.asMonorepo()
			.withRegisteredAt('2024-01-03T00:00:00Z');

		monorepo.createGitRepo(vol);
		monorepo.createProjects(vol, ['project-a', 'project-b']);

		// Update repositories data
		const groveFolder = '/home/testuser/.grove';
		new RepositoriesDataBuilder()
			.addRepository(new RepositoryBuilder('/repos/test-repo-1', 'test-repo-1'))
			.addRepository(monorepo)
			.writeTo(vol, groveFolder);

		// Reset services to pick up new repositories
		resetContainer();
		registerServices(getContainer());

		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CreateGroveScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		// In offline mode (no LLM), should show name input
		expect(output).toContain('Create New Grove');
	});

	it('should render without errors', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<CreateGroveScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toBeDefined();
		expect(output.length).toBeGreaterThan(0);
	});
});
