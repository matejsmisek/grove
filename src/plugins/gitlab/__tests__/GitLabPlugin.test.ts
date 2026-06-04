import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	GITLAB_TOKEN_ENV_VAR,
	GITLAB_URL_ENV_VAR,
	GitLabPlugin,
	GitLabTokenValidationError,
} from '../GitLabPlugin.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Raw GitLab API user shape (snake_case)
const rawUser = {
	id: 42,
	username: 'testuser',
	name: 'Test User',
	email: 'test@example.com',
	web_url: 'https://gitlab.com/testuser',
};

describe('GitLabPlugin', () => {
	let plugin: GitLabPlugin;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		plugin = new GitLabPlugin();
		originalEnv = { ...process.env };
		delete process.env[GITLAB_TOKEN_ENV_VAR];
		delete process.env[GITLAB_URL_ENV_VAR];
		mockFetch.mockReset();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	describe('metadata', () => {
		it('should have correct plugin metadata', () => {
			expect(plugin.metadata.id).toBe('gitlab');
			expect(plugin.metadata.name).toBe('GitLab');
			expect(plugin.metadata.version).toBe('0.1.0');
			expect(plugin.metadata.description).toContain('GitLab');
		});
	});

	describe('getAccessToken', () => {
		it('should return undefined when no token is configured', () => {
			expect(plugin.getAccessToken()).toBeUndefined();
		});

		it('should return token from env var', () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'env-token-123';
			expect(plugin.getAccessToken()).toBe('env-token-123');
		});

		it('should return token from settings when env var is not set', () => {
			plugin.configure({ accessToken: 'settings-token-456' });
			expect(plugin.getAccessToken()).toBe('settings-token-456');
		});

		it('should prioritize env var over settings', () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'env-token-123';
			plugin.configure({ accessToken: 'settings-token-456' });
			expect(plugin.getAccessToken()).toBe('env-token-123');
		});
	});

	describe('getBaseUrl', () => {
		it('should default to gitlab.com', () => {
			expect(plugin.getBaseUrl()).toBe('https://gitlab.com');
		});

		it('should use settings baseUrl when set', () => {
			plugin.configure({ baseUrl: 'https://gitlab.example.com' });
			expect(plugin.getBaseUrl()).toBe('https://gitlab.example.com');
		});

		it('should prioritize env var over settings', () => {
			process.env[GITLAB_URL_ENV_VAR] = 'https://env.gitlab.com';
			plugin.configure({ baseUrl: 'https://gitlab.example.com' });
			expect(plugin.getBaseUrl()).toBe('https://env.gitlab.com');
		});
	});

	describe('isAvailable', () => {
		it('should return false when no token is configured', async () => {
			expect(await plugin.isAvailable()).toBe(false);
		});

		it('should return true when env var token is set', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'test-token';
			expect(await plugin.isAvailable()).toBe(true);
		});

		it('should return true when settings token is configured', async () => {
			plugin.configure({ accessToken: 'settings-token' });
			expect(await plugin.isAvailable()).toBe(true);
		});
	});

	describe('validateToken', () => {
		it('should throw error when no token is configured', async () => {
			await expect(plugin.validateToken()).rejects.toThrow(GitLabTokenValidationError);
			await expect(plugin.validateToken()).rejects.toThrow(
				`GitLab token not found. Set the ${GITLAB_TOKEN_ENV_VAR} environment variable`
			);
		});

		it('should return mapped user on successful validation', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'valid-token';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => rawUser,
			});

			const user = await plugin.validateToken();

			expect(user).toEqual({
				id: 42,
				username: 'testuser',
				name: 'Test User',
				email: 'test@example.com',
				webUrl: 'https://gitlab.com/testuser',
			});
			expect(mockFetch).toHaveBeenCalledWith('https://gitlab.com/api/v4/user', {
				method: 'GET',
				headers: {
					'PRIVATE-TOKEN': 'valid-token',
					Accept: 'application/json',
				},
			});
		});

		it('should call the configured self-hosted instance URL', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'valid-token';
			plugin.configure({ baseUrl: 'https://gitlab.example.com/' });
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => rawUser,
			});

			await plugin.validateToken();

			expect(mockFetch).toHaveBeenCalledWith(
				'https://gitlab.example.com/api/v4/user',
				expect.anything()
			);
		});

		it('should throw error on 401 unauthorized', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'invalid-token';
			mockFetch.mockResolvedValue({
				ok: false,
				status: 401,
			});

			await expect(plugin.validateToken()).rejects.toThrow(GitLabTokenValidationError);
			await expect(plugin.validateToken()).rejects.toThrow('Invalid GitLab token');
		});

		it('should throw error with API message on other HTTP errors', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'test-token';
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				json: async () => ({ message: 'Forbidden' }),
			});

			await expect(plugin.validateToken()).rejects.toThrow('GitLab API error: Forbidden');
		});

		it('should throw error with status code when API error parsing fails', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'test-token';
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: async () => {
					throw new Error('Invalid JSON');
				},
			});

			await expect(plugin.validateToken()).rejects.toThrow('GitLab API returned status 500');
		});

		it('should throw error on network failure', async () => {
			process.env[GITLAB_TOKEN_ENV_VAR] = 'test-token';
			mockFetch.mockRejectedValue(new Error('Network error'));

			await expect(plugin.validateToken()).rejects.toThrow(GitLabTokenValidationError);
			await expect(plugin.validateToken()).rejects.toThrow('Failed to connect to GitLab API');
		});
	});

	describe('initialize', () => {
		it('should just mark the plugin initialized without calling the API', async () => {
			await plugin.initialize();

			expect(plugin.isInitialized()).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should not throw when no token is configured', async () => {
			// Enabling must never crash the app on a missing token
			await expect(plugin.initialize()).resolves.toBeUndefined();
			expect(plugin.isInitialized()).toBe(true);
		});
	});

	describe('cleanup', () => {
		it('should reset initialized state', async () => {
			await plugin.initialize();
			expect(plugin.isInitialized()).toBe(true);

			await plugin.cleanup();

			expect(plugin.isInitialized()).toBe(false);
			expect(plugin.getCurrentUser()).toBeNull();
		});
	});

	describe('configure and getSettings', () => {
		it('should store and retrieve settings', () => {
			plugin.configure({
				accessToken: 'test-token',
				baseUrl: 'https://gitlab.example.com',
			});

			const settings = plugin.getSettings();

			expect(settings.accessToken).toBe('test-token');
			expect(settings.baseUrl).toBe('https://gitlab.example.com');
		});

		it('should merge settings on multiple configure calls', () => {
			plugin.configure({ accessToken: 'token-1' });
			plugin.configure({ defaultProjectId: 'group/project' });

			const settings = plugin.getSettings();

			expect(settings.accessToken).toBe('token-1');
			expect(settings.defaultProjectId).toBe('group/project');
		});

		it('should return a copy of settings to prevent mutation', () => {
			plugin.configure({ accessToken: 'token-1' });

			const settings = plugin.getSettings();
			settings.accessToken = 'mutated-token';

			expect(plugin.getSettings().accessToken).toBe('token-1');
		});
	});

	describe('GitLabTokenValidationError', () => {
		it('should have correct name', () => {
			const error = new GitLabTokenValidationError('Test error');
			expect(error.name).toBe('GitLabTokenValidationError');
		});

		it('should store message and cause', () => {
			const cause = new Error('Original error');
			const error = new GitLabTokenValidationError('Wrapped error', cause);
			expect(error.message).toBe('Wrapped error');
			expect(error.cause).toBe(cause);
		});

		it('should be instanceof Error', () => {
			const error = new GitLabTokenValidationError('Test error');
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(GitLabTokenValidationError);
		});
	});
});
