import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ISettingsService } from '../../storage/SettingsService.js';
import { SessionLauncherService } from '../SessionLauncherService.js';
import type { ISessionTemplateService } from '../SessionTemplateService.js';

// Mock the shared command-availability helper so terminal detection is
// deterministic without spawning real `which` probes.
const { commandState } = vi.hoisted(() => ({ commandState: { installed: new Set<string>() } }));
vi.mock('../../utils/commandExists.js', () => ({
	commandExists: vi.fn((command: string) => Promise.resolve(commandState.installed.has(command))),
}));

// Mock the external editor so openSessionWithPrompt's prompt resolution is deterministic.
const { editorState } = vi.hoisted(() => ({
	editorState: { available: true, edited: null as string | null },
}));
vi.mock('../../utils/externalEditor.js', () => ({
	hasExternalEditor: vi.fn(() => editorState.available),
	openExternalEditor: vi.fn(() => editorState.edited),
}));

describe('SessionLauncherService', () => {
	let service: SessionLauncherService;
	let mockTemplateService: ISessionTemplateService;
	let mockSettingsService: ISettingsService;

	beforeEach(() => {
		commandState.installed = new Set();

		mockTemplateService = {
			getDefaultTemplate: vi.fn(),
			getEffectiveTemplate: vi.fn(),
			getTemplateForRepo: vi.fn(),
			getPromptTemplateForRepo: vi.fn(),
			applyTemplate: vi.fn(),
		};

		mockSettingsService = {
			getStorageConfig: vi.fn().mockReturnValue({ groveFolder: '/home/test/.grove' }),
			readSettings: vi.fn().mockReturnValue({}),
			getDefaultSettings: vi.fn(),
			initializeStorage: vi.fn(),
			writeSettings: vi.fn(),
			updateSettings: vi.fn(),
		};

		service = new SessionLauncherService(mockTemplateService, mockSettingsService);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('detectAvailableTerminals', () => {
		it('returns both terminals when konsole and kitty are installed', async () => {
			commandState.installed = new Set(['konsole', 'kitty']);
			await expect(service.detectAvailableTerminals()).resolves.toEqual(['konsole', 'kitty']);
		});

		it('returns only the installed terminals', async () => {
			commandState.installed = new Set(['kitty']);
			await expect(service.detectAvailableTerminals()).resolves.toEqual(['kitty']);
		});

		it('returns an empty list when neither is installed', async () => {
			await expect(service.detectAvailableTerminals()).resolves.toEqual([]);
		});

		it('detectTerminal returns the first available terminal', async () => {
			commandState.installed = new Set(['konsole', 'kitty']);
			await expect(service.detectTerminal()).resolves.toBe('konsole');
		});

		it('detectTerminal returns null when none are installed', async () => {
			await expect(service.detectTerminal()).resolves.toBeNull();
		});
	});

	describe('openSessionWithPrompt', () => {
		it('fails without launching when the prompt editor is cancelled', async () => {
			commandState.installed = new Set(['konsole']);
			editorState.available = true;
			editorState.edited = null; // user cancelled the editor
			vi.mocked(mockTemplateService.getPromptTemplateForRepo).mockReturnValue('Lead: {prompt}');

			const result = await service.openSessionWithPrompt(
				'/work',
				'/repos/app',
				'TASK BODY',
				undefined,
				'my-grove',
				'frontend'
			);

			expect(result.success).toBe(false);
			expect(result.message).toContain('No prompt provided');
		});
	});
});
