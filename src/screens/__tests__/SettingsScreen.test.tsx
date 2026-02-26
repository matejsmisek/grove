import { render } from 'ink-testing-library';
import React from 'react';
import { Volume } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestEnvironment } from '../../__tests__/builders.js';
import { getContainer, resetContainer } from '../../di/Container.js';
import { ServiceProvider } from '../../di/ServiceContext.js';
import { NavigationProvider } from '../../navigation/NavigationContext.js';
import { registerServices } from '../../services/registration.js';
import { SettingsScreen } from '../SettingsScreen.js';

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

describe('SettingsScreen - Visual Workflow', () => {
	beforeEach(() => {
		resetContainer();
		
		vol = new Volume();

		// Set up test environment
		createTestEnvironment(vol);

		// Register services
		registerServices(getContainer());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should display settings menu with all options', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Settings');
		expect(output).toContain('Registered Repositories');
		expect(output).toContain('Working Folder');
		expect(output).toContain('IDE Settings');
		expect(output).toContain('Claude Terminal Settings');
		expect(output).toContain('LLM Settings');
	});

	it('should highlight first option by default', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		// First option should be highlighted with cursor
		expect(output).toContain('❯');
		// First option should contain "Registered Repositories"
		const lines = output.split('\n');
		const cursorLine = lines.find((line) => line.includes('❯'));
		expect(cursorLine).toContain('Registered Repositories');
	});

	it('should move cursor down with down arrow', async () => {
		const { lastFrame, stdin } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		// Press down arrow
		stdin.write('\x1B[B');
		await new Promise((resolve) => setTimeout(resolve, 50));

		const output = lastFrame()!;
		const lines = output.split('\n');
		const cursorLine = lines.find((line) => line.includes('❯'));
		// Second option should be highlighted
		expect(cursorLine).toContain('Working Folder');
	});

	it('should move cursor up with up arrow', async () => {
		const { lastFrame, stdin } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		// Press up arrow from first option (should wrap to last)
		stdin.write('\x1B[A');
		await new Promise((resolve) => setTimeout(resolve, 50));

		const output = lastFrame()!;
		const lines = output.split('\n');
		const cursorLine = lines.find((line) => line.includes('❯'));
		// Should wrap to last option
		expect(cursorLine).toBeDefined();
	});

	it('should show numbered options', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('1.');
		expect(output).toContain('2.');
		expect(output).toContain('3.');
		expect(output).toContain('4.');
		expect(output).toContain('5.');
	});

	it('should display help text for navigation', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('↑/↓');
		expect(output).toContain('Enter');
	});

	it('should display section parameter if provided', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen section="repositories" />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('Section:');
		expect(output).toContain('repositories');
	});

	it('should show all expected menu items', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		const expectedOptions = [
			'Registered Repositories',
			'Working Folder',
			'IDE Settings',
			'Claude Terminal Settings',
			'LLM Settings',
			'Display Preferences',
		];

		for (const option of expectedOptions) {
			expect(output).toContain(option);
		}
	});

	it('should indicate placeholder options', () => {
		const { lastFrame } = render(
			<ServiceProvider container={getContainer()}>
				<NavigationProvider>
					<SettingsScreen />
				</NavigationProvider>
			</ServiceProvider>
		);

		const output = lastFrame()!;
		expect(output).toContain('coming soon');
	});
});
