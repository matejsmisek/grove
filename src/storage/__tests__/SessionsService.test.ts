import { Volume } from 'memfs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs, setupMockHomeDir } from '../../__tests__/helpers.js';
import { SessionsService } from '../SessionsService.js';
import type { AgentSession } from '../types.js';

// Mock filesystem
let vol: Volume;
let mockHomeDir: string;

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

describe('SessionsService', () => {
	let service: SessionsService;
	let mockSessionsPath: string;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		// Setup mock home directory
		mockHomeDir = '/home/testuser';
		setupMockHomeDir(vol, mockHomeDir);
		mockSessionsPath = path.join(mockHomeDir, '.grove', 'sessions.json');

		service = new SessionsService({ sessionsPath: mockSessionsPath });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('readSessions', () => {
		it('should return default data when file does not exist', () => {
			const data = service.readSessions();

			expect(data.sessions).toEqual([]);
			expect(data.version).toBe('1.0.0');
			expect(data.lastUpdated).toBeDefined();
		});

		it('should read existing sessions file', () => {
			const mockData = {
				sessions: [
					{
						sessionId: 'test-123',
						agentType: 'claude' as const,
						groveId: 'grove-1',
						workspacePath: '/home/user/project',
						worktreePath: null,
						status: 'active' as const,
						lastUpdate: '2024-01-01T00:00:00Z',
						isRunning: true,
					},
				],
				version: '1.0.0',
				lastUpdated: '2024-01-01T00:00:00Z',
			};

			vol.writeFileSync(mockSessionsPath, JSON.stringify(mockData));

			const data = service.readSessions();

			expect(data.sessions).toHaveLength(1);
			expect(data.sessions[0].sessionId).toBe('test-123');
		});
	});

	describe('writeSessions', () => {
		it('should write sessions data to file', () => {
			const data = {
				sessions: [],
				version: '1.0.0',
				lastUpdated: '2024-01-01T00:00:00Z',
			};

			service.writeSessions(data);

			expect(vol.existsSync(mockSessionsPath)).toBe(true);
			const content = vol.readFileSync(mockSessionsPath, 'utf8') as string;
			const parsed = JSON.parse(content);
			expect(parsed.version).toBe('1.0.0');
		});

		it('should update lastUpdated timestamp', () => {
			const data = {
				sessions: [],
				version: '1.0.0',
				lastUpdated: '2024-01-01T00:00:00Z',
			};

			service.writeSessions(data);

			const content = vol.readFileSync(mockSessionsPath, 'utf8') as string;
			const parsed = JSON.parse(content);
			expect(parsed.lastUpdated).not.toBe('2024-01-01T00:00:00Z');
		});
	});

	describe('addSession', () => {
		it('should add a new session', () => {
			const session: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session);

			const data = service.readSessions();
			expect(data.sessions).toHaveLength(1);
			expect(data.sessions[0].sessionId).toBe('test-123');
		});

		it('should replace existing session with same ID', () => {
			const session1: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			const session2: AgentSession = {
				...session1,
				status: 'idle',
			};

			service.addSession(session1);
			service.addSession(session2);

			const data = service.readSessions();
			expect(data.sessions).toHaveLength(1);
			expect(data.sessions[0].status).toBe('idle');
		});
	});

	describe('updateSession', () => {
		it('should update existing session', () => {
			const session: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session);
			const updated = service.updateSession('test-123', { status: 'idle' });

			expect(updated).not.toBeNull();
			expect(updated?.status).toBe('idle');
			expect(updated?.sessionId).toBe('test-123');
		});

		it('should return null for non-existent session', () => {
			const updated = service.updateSession('non-existent', { status: 'idle' });

			expect(updated).toBeNull();
		});
	});

	describe('removeSession', () => {
		it('should remove existing session', () => {
			const session: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session);
			const removed = service.removeSession('test-123');

			expect(removed).toBe(true);
			const data = service.readSessions();
			expect(data.sessions).toHaveLength(0);
		});

		it('should return false for non-existent session', () => {
			const removed = service.removeSession('non-existent');

			expect(removed).toBe(false);
		});
	});

	describe('getSessionsByGrove', () => {
		it('should return sessions for specific grove', () => {
			const session1: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			const session2: AgentSession = {
				sessionId: 'test-456',
				agentType: 'claude',
				groveId: 'grove-2',
				workspacePath: '/home/user/project2',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session1);
			service.addSession(session2);

			const sessions = service.getSessionsByGrove('grove-1');

			expect(sessions).toHaveLength(1);
			expect(sessions[0].sessionId).toBe('test-123');
		});
	});

	describe('getSessionsByWorkspace', () => {
		it('should return sessions for specific workspace', () => {
			const session1: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			const session2: AgentSession = {
				sessionId: 'test-456',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project2',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session1);
			service.addSession(session2);

			const sessions = service.getSessionsByWorkspace('/home/user/project');

			expect(sessions).toHaveLength(1);
			expect(sessions[0].sessionId).toBe('test-123');
		});
	});

	describe('getSession', () => {
		it('should return specific session by ID', () => {
			const session: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session);
			const found = service.getSession('test-123');

			expect(found).not.toBeNull();
			expect(found?.sessionId).toBe('test-123');
		});

		it('should return null for non-existent session', () => {
			const found = service.getSession('non-existent');

			expect(found).toBeNull();
		});
	});

	describe('getAllActiveSessions', () => {
		it('should return only active running sessions', () => {
			const activeSession: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			const closedSession: AgentSession = {
				sessionId: 'test-456',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project2',
				worktreePath: null,
				status: 'closed',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: false,
			};

			const notRunningSession: AgentSession = {
				sessionId: 'test-789',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project3',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: false,
			};

			service.addSession(activeSession);
			service.addSession(closedSession);
			service.addSession(notRunningSession);

			const activeSessions = service.getAllActiveSessions();

			expect(activeSessions).toHaveLength(1);
			expect(activeSessions[0].sessionId).toBe('test-123');
		});
	});

	describe('buildIndex', () => {
		it('should build index with all lookup types', () => {
			const session1: AgentSession = {
				sessionId: 'test-123',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			const session2: AgentSession = {
				sessionId: 'test-456',
				agentType: 'claude',
				groveId: 'grove-2',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: '2024-01-01T00:00:00Z',
				isRunning: true,
			};

			service.addSession(session1);
			service.addSession(session2);

			const index = service.buildIndex();

			expect(index.bySessionId['test-123']).toBeDefined();
			expect(index.byWorkspace['/home/user/project']).toHaveLength(2);
			expect(index.byGrove['grove-1']).toHaveLength(1);
		});
	});

	describe('cleanupStaleSessions', () => {
		it('should remove sessions older than threshold', () => {
			const oldDate = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago
			const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

			const oldSession: AgentSession = {
				sessionId: 'test-old',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'closed',
				lastUpdate: oldDate.toISOString(),
				isRunning: false,
			};

			const recentSession: AgentSession = {
				sessionId: 'test-recent',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: recentDate.toISOString(),
				isRunning: true,
			};

			service.addSession(oldSession);
			service.addSession(recentSession);

			const removedCount = service.cleanupStaleSessions(60); // 60 minute threshold

			expect(removedCount).toBe(1);

			const data = service.readSessions();
			expect(data.sessions).toHaveLength(1);
			expect(data.sessions[0].sessionId).toBe('test-recent');
		});

		it('should keep running sessions even if old', () => {
			const oldDate = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago

			const oldRunningSession: AgentSession = {
				sessionId: 'test-old-running',
				agentType: 'claude',
				groveId: 'grove-1',
				workspacePath: '/home/user/project',
				worktreePath: null,
				status: 'active',
				lastUpdate: oldDate.toISOString(),
				isRunning: true,
			};

			service.addSession(oldRunningSession);

			const removedCount = service.cleanupStaleSessions(60);

			expect(removedCount).toBe(0);

			const data = service.readSessions();
			expect(data.sessions).toHaveLength(1);
		});
	});
});
