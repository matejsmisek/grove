import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	ASANA_TOKEN_ENV_VAR,
	AsanaApiRequestError,
	AsanaPlugin,
	AsanaTokenValidationError,
} from '../AsanaPlugin.js';
import {
	ASANA_TEMPLATE_VARIABLES,
	buildAsanaTemplateEditorHeader,
	stripAsanaTemplateComments,
} from '../template.js';
import type { AsanaApiResponse, AsanaUser } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AsanaPlugin', () => {
	let plugin: AsanaPlugin;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		plugin = new AsanaPlugin();
		originalEnv = { ...process.env };
		// Clear ASANA_TOKEN env var for each test
		delete process.env[ASANA_TOKEN_ENV_VAR];
		mockFetch.mockReset();
	});

	afterEach(() => {
		// Restore original env
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	describe('metadata', () => {
		it('should have correct plugin metadata', () => {
			expect(plugin.metadata.id).toBe('asana');
			expect(plugin.metadata.name).toBe('Asana');
			expect(plugin.metadata.version).toBe('0.1.0');
			expect(plugin.metadata.description).toContain('Asana');
		});
	});

	describe('getAccessToken', () => {
		it('should return undefined when no token is configured', () => {
			expect(plugin.getAccessToken()).toBeUndefined();
		});

		it('should return token from env var', () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'env-token-123';
			expect(plugin.getAccessToken()).toBe('env-token-123');
		});

		it('should return token from settings when env var is not set', () => {
			plugin.configure({ accessToken: 'settings-token-456' });
			expect(plugin.getAccessToken()).toBe('settings-token-456');
		});

		it('should prioritize env var over settings', () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'env-token-123';
			plugin.configure({ accessToken: 'settings-token-456' });
			expect(plugin.getAccessToken()).toBe('env-token-123');
		});
	});

	describe('isAvailable', () => {
		it('should return false when no token is configured', async () => {
			expect(await plugin.isAvailable()).toBe(false);
		});

		it('should return true when env var token is set', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'test-token';
			expect(await plugin.isAvailable()).toBe(true);
		});

		it('should return true when settings token is configured', async () => {
			plugin.configure({ accessToken: 'settings-token' });
			expect(await plugin.isAvailable()).toBe(true);
		});
	});

	describe('validateToken', () => {
		const mockUser: AsanaUser = {
			gid: '12345',
			name: 'Test User',
			email: 'test@example.com',
		};

		const mockSuccessResponse: AsanaApiResponse<AsanaUser> = {
			data: mockUser,
		};

		it('should throw error when no token is configured', async () => {
			await expect(plugin.validateToken()).rejects.toThrow(AsanaTokenValidationError);
			await expect(plugin.validateToken()).rejects.toThrow(
				`Asana token not found. Set the ${ASANA_TOKEN_ENV_VAR} environment variable`
			);
		});

		it('should return user on successful validation', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockSuccessResponse,
			});

			const user = await plugin.validateToken();

			expect(user).toEqual(mockUser);
			expect(mockFetch).toHaveBeenCalledWith('https://app.asana.com/api/1.0/users/me', {
				method: 'GET',
				headers: {
					Authorization: 'Bearer valid-token',
					Accept: 'application/json',
				},
			});
		});

		it('should throw error on 401 unauthorized', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'invalid-token';
			mockFetch.mockResolvedValue({
				ok: false,
				status: 401,
			});

			await expect(plugin.validateToken()).rejects.toThrow(AsanaTokenValidationError);
			await expect(plugin.validateToken()).rejects.toThrow('Invalid Asana token');
		});

		it('should throw error with API error message on other HTTP errors', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'test-token';
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				json: async () => ({
					errors: [{ message: 'Forbidden access' }],
				}),
			});

			await expect(plugin.validateToken()).rejects.toThrow('Asana API error: Forbidden access');
		});

		it('should throw error with status code when API error parsing fails', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'test-token';
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: async () => {
					throw new Error('Invalid JSON');
				},
			});

			await expect(plugin.validateToken()).rejects.toThrow('Asana API returned status 500');
		});

		it('should throw error on network failure', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'test-token';
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(plugin.validateToken()).rejects.toThrow(AsanaTokenValidationError);
			await expect(plugin.validateToken()).rejects.toThrow('Failed to connect to Asana API');
		});
	});

	describe('initialize', () => {
		const mockUser: AsanaUser = {
			gid: '12345',
			name: 'Test User',
			email: 'test@example.com',
		};

		const mockSuccessResponse: AsanaApiResponse<AsanaUser> = {
			data: mockUser,
		};

		it('should validate token and store user on successful initialization', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockSuccessResponse,
			});

			await plugin.initialize();

			expect(plugin.isInitialized()).toBe(true);
			expect(plugin.getCurrentUser()).toEqual(mockUser);
		});

		it('should throw error on invalid token during initialization', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'invalid-token';
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
			});

			await expect(plugin.initialize()).rejects.toThrow(AsanaTokenValidationError);
			expect(plugin.isInitialized()).toBe(false);
			expect(plugin.getCurrentUser()).toBeNull();
		});

		it('should not re-initialize if already initialized', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => mockSuccessResponse,
			});

			await plugin.initialize();
			await plugin.initialize(); // Second call

			// fetch should only be called once
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('cleanup', () => {
		const mockUser: AsanaUser = {
			gid: '12345',
			name: 'Test User',
			email: 'test@example.com',
		};

		it('should reset initialized state and clear user', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: mockUser }),
			});

			await plugin.initialize();
			expect(plugin.isInitialized()).toBe(true);
			expect(plugin.getCurrentUser()).toEqual(mockUser);

			await plugin.cleanup();

			expect(plugin.isInitialized()).toBe(false);
			expect(plugin.getCurrentUser()).toBeNull();
		});
	});

	describe('getTask', () => {
		it('throws when no token is configured', async () => {
			await expect(plugin.getTask('123')).rejects.toThrow(AsanaTokenValidationError);
		});

		it('returns task with name and permalink url on success', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						gid: '123',
						name: 'Fix the login bug',
						permalink_url: 'https://app.asana.com/0/999/123',
					},
				}),
			});

			const task = await plugin.getTask('123');

			expect(task).toEqual({
				gid: '123',
				name: 'Fix the login bug',
				url: 'https://app.asana.com/0/999/123',
			});
			expect(mockFetch).toHaveBeenCalledWith(
				'https://app.asana.com/api/1.0/tasks/123?opt_fields=name,permalink_url,notes,assignee.name',
				{
					method: 'GET',
					headers: {
						Authorization: 'Bearer valid-token',
						Accept: 'application/json',
					},
				}
			);
		});

		it('returns the task description (notes) when present', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						gid: '123',
						name: 'Fix the login bug',
						permalink_url: 'https://app.asana.com/0/999/123',
						notes: 'Steps to reproduce:\n1. Open login',
					},
				}),
			});

			const task = await plugin.getTask('123');

			expect(task.notes).toBe('Steps to reproduce:\n1. Open login');
		});

		it('falls back to a canonical url when permalink is missing', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: { gid: '123', name: 'No permalink' } }),
			});

			const task = await plugin.getTask('123');

			expect(task.url).toBe('https://app.asana.com/0/0/123');
		});

		it('throws AsanaTokenValidationError on 401', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'bad-token';
			mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

			await expect(plugin.getTask('123')).rejects.toThrow(AsanaTokenValidationError);
		});

		it('throws AsanaApiRequestError with a not-found message on 404', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValue({ ok: false, status: 404 });

			await expect(plugin.getTask('123')).rejects.toThrow(AsanaApiRequestError);
			await expect(plugin.getTask('123')).rejects.toThrow('Asana task 123 not found');
		});

		it('throws AsanaApiRequestError on network failure', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockRejectedValue(new Error('Network error'));

			await expect(plugin.getTask('123')).rejects.toThrow(AsanaApiRequestError);
			await expect(plugin.getTask('123')).rejects.toThrow('Failed to connect to Asana API');
		});

		it('returns the assignee name when present', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						gid: '123',
						name: 'Fix the login bug',
						permalink_url: 'https://app.asana.com/0/999/123',
						assignee: { gid: '42', name: 'Ada Lovelace' },
					},
				}),
			});

			const task = await plugin.getTask('123');

			expect(task.assignee).toBe('Ada Lovelace');
		});

		it('leaves the assignee undefined when the task is unassigned', async () => {
			process.env[ASANA_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: { gid: '123', name: 'Unassigned', assignee: null } }),
			});

			const task = await plugin.getTask('123');

			expect(task.assignee).toBeUndefined();
		});
	});

	describe('instant Claude template', () => {
		const task = {
			gid: '123',
			name: 'Fix the login bug',
			url: 'https://app.asana.com/0/999/123',
			notes: 'Steps to reproduce',
			assignee: 'Ada Lovelace',
		};

		it('renders the default template when none is configured', () => {
			expect(plugin.buildInstantClaudePrompt(task)).toBe(
				'Task Name: Fix the login bug\n<description>Steps to reproduce</description>'
			);
		});

		it('renders a configured custom template with all variables', () => {
			plugin.configure({
				instantClaudeTemplate:
					'{task_name} ({task_gid})\nAssignee: {task_assignee}\nURL: {task_url}\n{task_description}',
			});

			expect(plugin.buildInstantClaudePrompt(task)).toBe(
				'Fix the login bug (123)\nAssignee: Ada Lovelace\nURL: https://app.asana.com/0/999/123\nSteps to reproduce'
			);
		});

		it('falls back to the default when the configured template is blank', () => {
			plugin.configure({ instantClaudeTemplate: '   ' });

			expect(plugin.buildInstantClaudePrompt(task)).toBe(
				'Task Name: Fix the login bug\n<description>Steps to reproduce</description>'
			);
		});

		it('substitutes empty strings for missing task fields', () => {
			plugin.configure({ instantClaudeTemplate: 'A:{task_assignee}|D:{task_description}' });

			expect(plugin.buildInstantClaudePrompt({ gid: '1', name: 'n', url: 'u' })).toBe('A:|D:');
		});
	});

	describe('template editor comments', () => {
		it('documents every variable as a comment line in the header', () => {
			const header = buildAsanaTemplateEditorHeader();

			for (const { token } of ASANA_TEMPLATE_VARIABLES) {
				expect(header).toContain(`#   ${token}`);
			}
			// Every header line is a comment or blank.
			for (const line of header.split('\n')) {
				expect(line === '' || line.startsWith('#')).toBe(true);
			}
		});

		it('round-trips: stripping the header restores the original body', () => {
			const body = 'Task Name: {task_name}\n<description>{task_description}</description>';
			const edited = buildAsanaTemplateEditorHeader() + body;

			expect(stripAsanaTemplateComments(edited)).toBe(body);
		});

		it('preserves markdown headings in the template body', () => {
			const body = '# Heading\nDo {task_name}';
			const edited = buildAsanaTemplateEditorHeader() + body;

			expect(stripAsanaTemplateComments(edited)).toBe(body);
		});

		it('returns empty string when only the comment header remains', () => {
			expect(stripAsanaTemplateComments(buildAsanaTemplateEditorHeader()).trim()).toBe('');
		});
	});

	describe('configure and getSettings', () => {
		it('should store and retrieve settings', () => {
			plugin.configure({
				accessToken: 'test-token',
				defaultWorkspaceId: 'workspace-1',
			});

			const settings = plugin.getSettings();

			expect(settings.accessToken).toBe('test-token');
			expect(settings.defaultWorkspaceId).toBe('workspace-1');
		});

		it('should merge settings on multiple configure calls', () => {
			plugin.configure({ accessToken: 'token-1' });
			plugin.configure({ defaultProjectId: 'project-1' });

			const settings = plugin.getSettings();

			expect(settings.accessToken).toBe('token-1');
			expect(settings.defaultProjectId).toBe('project-1');
		});

		it('should return a copy of settings to prevent mutation', () => {
			plugin.configure({ accessToken: 'token-1' });

			const settings = plugin.getSettings();
			settings.accessToken = 'mutated-token';

			expect(plugin.getSettings().accessToken).toBe('token-1');
		});
	});

	describe('AsanaTokenValidationError', () => {
		it('should have correct name', () => {
			const error = new AsanaTokenValidationError('Test error');
			expect(error.name).toBe('AsanaTokenValidationError');
		});

		it('should store message', () => {
			const error = new AsanaTokenValidationError('Test error message');
			expect(error.message).toBe('Test error message');
		});

		it('should store cause', () => {
			const cause = new Error('Original error');
			const error = new AsanaTokenValidationError('Wrapped error', cause);
			expect(error.cause).toBe(cause);
		});

		it('should be instanceof Error', () => {
			const error = new AsanaTokenValidationError('Test error');
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(AsanaTokenValidationError);
		});
	});
});
