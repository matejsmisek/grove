import { Volume } from 'memfs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockFs } from '../../__tests__/helpers.js';
import type { WorkspaceConfig, WorkspaceContext } from '../../storage/types.js';
import { WorkspaceService } from '../WorkspaceService.js';

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

// Mock os.homedir()
vi.mock('os', () => ({
	default: {
		homedir: () => '/home/testuser',
	},
}));

describe('WorkspaceService', () => {
	let service: WorkspaceService;

	beforeEach(() => {
		// Create fresh in-memory filesystem
		const mockFs = createMockFs();
		vol = mockFs.vol;

		service = new WorkspaceService();

		// Create home directory and .grove folder
		vol.mkdirSync('/home/testuser/.grove', { recursive: true });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('discoverWorkspace', () => {
		it('should find workspace config in current directory', () => {
			const workspacePath = '/workspace';
			vol.mkdirSync(workspacePath, { recursive: true });
			vol.writeFileSync(
				path.join(workspacePath, '.grove.workspace.json'),
				JSON.stringify({ name: 'test', version: '1.0.0', grovesFolder: './groves' })
			);

			const result = service.discoverWorkspace(workspacePath);

			expect(result).toBe(workspacePath);
		});

		it('should find workspace config in parent directory', () => {
			const workspacePath = '/workspace';
			const subDir = '/workspace/subfolder/deep';

			vol.mkdirSync(workspacePath, { recursive: true });
			vol.mkdirSync(subDir, { recursive: true });
			vol.writeFileSync(
				path.join(workspacePath, '.grove.workspace.json'),
				JSON.stringify({ name: 'test', version: '1.0.0', grovesFolder: './groves' })
			);

			const result = service.discoverWorkspace(subDir);

			expect(result).toBe(workspacePath);
		});

		it('should return undefined when no workspace config found', () => {
			const dir = '/no-workspace';
			vol.mkdirSync(dir, { recursive: true });

			const result = service.discoverWorkspace(dir);

			expect(result).toBeUndefined();
		});

		it('should check root directory', () => {
			vol.writeFileSync(
				'/.grove.workspace.json',
				JSON.stringify({ name: 'root', version: '1.0.0', grovesFolder: './groves' })
			);

			const result = service.discoverWorkspace('/some/deep/path');

			expect(result).toBe('/');
		});
	});

	describe('readWorkspaceConfig', () => {
		it('should read and parse workspace configuration', () => {
			const workspacePath = '/workspace';
			const config: WorkspaceConfig = {
				name: 'Test Workspace',
				version: '1.0.0',
				grovesFolder: './groves',
			};

			vol.mkdirSync(workspacePath, { recursive: true });
			vol.writeFileSync(path.join(workspacePath, '.grove.workspace.json'), JSON.stringify(config));

			const result = service.readWorkspaceConfig(workspacePath);

			expect(result).toEqual(config);
		});

		it('should throw error when config file does not exist', () => {
			const workspacePath = '/workspace';
			vol.mkdirSync(workspacePath, { recursive: true });

			expect(() => service.readWorkspaceConfig(workspacePath)).toThrow(
				'Workspace configuration not found'
			);
		});
	});

	describe('writeWorkspaceConfig', () => {
		it('should write workspace configuration to file', () => {
			const workspacePath = '/workspace';
			const config: WorkspaceConfig = {
				name: 'Test Workspace',
				version: '1.0.0',
				grovesFolder: './groves',
			};

			vol.mkdirSync(workspacePath, { recursive: true });

			service.writeWorkspaceConfig(workspacePath, config);

			const written = JSON.parse(
				vol.readFileSync(path.join(workspacePath, '.grove.workspace.json'), 'utf-8') as string
			);
			expect(written).toEqual(config);
		});

		it('should format JSON with tabs', () => {
			const workspacePath = '/workspace';
			const config: WorkspaceConfig = {
				name: 'Test Workspace',
				version: '1.0.0',
				grovesFolder: './groves',
			};

			vol.mkdirSync(workspacePath, { recursive: true });

			service.writeWorkspaceConfig(workspacePath, config);

			const content = vol.readFileSync(
				path.join(workspacePath, '.grove.workspace.json'),
				'utf-8'
			) as string;
			expect(content).toContain('\t');
		});
	});

	describe('initWorkspace', () => {
		it('should create workspace configuration and folder structure', () => {
			const workspacePath = '/workspace';
			const name = 'Test Workspace';
			const grovesFolder = './groves';

			vol.mkdirSync(workspacePath, { recursive: true });

			service.initWorkspace(workspacePath, name, grovesFolder);

			// Check .grove.workspace.json
			expect(vol.existsSync(path.join(workspacePath, '.grove.workspace.json'))).toBe(true);
			const config = JSON.parse(
				vol.readFileSync(path.join(workspacePath, '.grove.workspace.json'), 'utf-8') as string
			);
			expect(config.name).toBe(name);
			expect(config.grovesFolder).toBe(grovesFolder);

			// Check .grove folder
			expect(vol.existsSync(path.join(workspacePath, '.grove'))).toBe(true);

			// Check data files
			expect(vol.existsSync(path.join(workspacePath, '.grove/repositories.json'))).toBe(true);
			expect(vol.existsSync(path.join(workspacePath, '.grove/groves.json'))).toBe(true);
			expect(vol.existsSync(path.join(workspacePath, '.grove/settings.json'))).toBe(true);
			expect(vol.existsSync(path.join(workspacePath, '.grove/recent.json'))).toBe(true);

			// Check groves folder
			expect(vol.existsSync(path.join(workspacePath, 'groves'))).toBe(true);
		});

		it('should create groves folder at absolute path', () => {
			const workspacePath = '/workspace';
			const name = 'Test Workspace';
			const grovesFolder = '/absolute/groves';

			vol.mkdirSync(workspacePath, { recursive: true });

			service.initWorkspace(workspacePath, name, grovesFolder);

			expect(vol.existsSync(grovesFolder)).toBe(true);
		});

		it('should add workspace to global tracking', () => {
			const workspacePath = '/workspace';
			const name = 'Test Workspace';
			const grovesFolder = './groves';

			vol.mkdirSync(workspacePath, { recursive: true });

			service.initWorkspace(workspacePath, name, grovesFolder);

			const globalWorkspaces = service.readGlobalWorkspaces();
			expect(globalWorkspaces.workspaces).toHaveLength(1);
			expect(globalWorkspaces.workspaces[0].name).toBe(name);
			expect(globalWorkspaces.workspaces[0].path).toBe(workspacePath);
		});
	});

	describe('resolveContext', () => {
		it('should return workspace context when in a workspace', () => {
			const workspacePath = '/workspace';
			const config: WorkspaceConfig = {
				name: 'Test Workspace',
				version: '1.0.0',
				grovesFolder: './groves',
			};

			vol.mkdirSync(workspacePath, { recursive: true });
			vol.writeFileSync(path.join(workspacePath, '.grove.workspace.json'), JSON.stringify(config));

			const result = service.resolveContext(workspacePath);

			expect(result.type).toBe('workspace');
			expect(result.config).toEqual(config);
			expect(result.workspacePath).toBe(workspacePath);
			expect(result.groveFolder).toBe(path.join(workspacePath, '.grove'));
			expect(result.grovesFolder).toBe(path.join(workspacePath, 'groves'));
		});

		it('should resolve absolute groves folder path', () => {
			const workspacePath = '/workspace';
			const config: WorkspaceConfig = {
				name: 'Test Workspace',
				version: '1.0.0',
				grovesFolder: '/absolute/groves',
			};

			vol.mkdirSync(workspacePath, { recursive: true });
			vol.writeFileSync(path.join(workspacePath, '.grove.workspace.json'), JSON.stringify(config));

			const result = service.resolveContext(workspacePath);

			expect(result.grovesFolder).toBe('/absolute/groves');
		});

		it('should return global context when not in a workspace or git repo', () => {
			const dir = '/no-workspace';
			vol.mkdirSync(dir, { recursive: true });

			const result = service.resolveContext(dir);

			expect(result.type).toBe('global');
			expect(result.groveFolder).toBe('/home/testuser/.grove');
			expect(result.config).toBeUndefined();
			expect(result.workspacePath).toBeUndefined();
		});

		it('should return repo context when inside a git repo but not a workspace', () => {
			const repoPath = '/repos/my-repo';
			vol.mkdirSync(path.join(repoPath, '.git'), { recursive: true });

			const result = service.resolveContext(repoPath);

			expect(result.type).toBe('repo');
			expect(result.repoPath).toBe(repoPath);
			expect(result.repoName).toBe('my-repo');
			expect(result.groveFolder).toBe(path.join(repoPath, '.grove'));
			expect(result.grovesFolder).toBe(path.join(repoPath, '.grove', 'groves'));
			expect(result.config).toBeUndefined();
		});

		it('should resolve repo context from a nested subdirectory', () => {
			const repoPath = '/repos/my-repo';
			const subDir = path.join(repoPath, 'src', 'deep');
			vol.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
			vol.mkdirSync(subDir, { recursive: true });

			const result = service.resolveContext(subDir);

			expect(result.type).toBe('repo');
			expect(result.repoPath).toBe(repoPath);
		});

		it('should prefer a workspace over an enclosing git repo', () => {
			const repoPath = '/repos/my-repo';
			vol.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
			vol.writeFileSync(
				path.join(repoPath, '.grove.workspace.json'),
				JSON.stringify({ name: 'WS', version: '1.0.0', grovesFolder: './groves' })
			);

			const result = service.resolveContext(repoPath);

			expect(result.type).toBe('workspace');
		});

		it('should resolve a linked worktree back to the main repo root', () => {
			const repoPath = '/repos/my-repo';
			const worktreePath = '/repos/my-repo/.grove/groves/grove-a/wt';
			vol.mkdirSync(path.join(repoPath, '.git', 'worktrees', 'wt'), { recursive: true });
			vol.mkdirSync(worktreePath, { recursive: true });
			// A linked worktree has a .git file pointing at the main repo's gitdir.
			vol.writeFileSync(
				path.join(worktreePath, '.git'),
				`gitdir: ${path.join(repoPath, '.git', 'worktrees', 'wt')}\n`
			);

			const result = service.resolveContext(worktreePath);

			expect(result.type).toBe('repo');
			expect(result.repoPath).toBe(repoPath);
			expect(result.groveFolder).toBe(path.join(repoPath, '.grove'));
		});
	});

	describe('readGlobalWorkspaces', () => {
		it('should read global workspaces file', () => {
			const workspacesData = {
				workspaces: [
					{ name: 'Workspace 1', path: '/workspace1', lastUsedAt: '2024-01-01T00:00:00Z' },
					{ name: 'Workspace 2', path: '/workspace2', lastUsedAt: '2024-01-02T00:00:00Z' },
				],
			};

			vol.writeFileSync('/home/testuser/.grove/workspaces.json', JSON.stringify(workspacesData));

			const result = service.readGlobalWorkspaces();

			expect(result).toEqual(workspacesData);
		});

		it('should return empty array when file does not exist', () => {
			const result = service.readGlobalWorkspaces();

			expect(result.workspaces).toEqual([]);
		});

		it('should return empty array on JSON parse error', () => {
			vol.writeFileSync('/home/testuser/.grove/workspaces.json', 'invalid json');

			const result = service.readGlobalWorkspaces();

			expect(result.workspaces).toEqual([]);
		});
	});

	describe('writeGlobalWorkspaces', () => {
		it('should write global workspaces file', () => {
			const workspacesData = {
				workspaces: [{ name: 'Workspace 1', path: '/workspace1', lastUsedAt: '2024-01-01T00:00:00Z' }],
			};

			service.writeGlobalWorkspaces(workspacesData);

			const written = JSON.parse(
				vol.readFileSync('/home/testuser/.grove/workspaces.json', 'utf-8') as string
			);
			expect(written).toEqual(workspacesData);
		});

		it('should create .grove folder if it does not exist', () => {
			vol.rmdirSync('/home/testuser/.grove');

			const workspacesData = { workspaces: [] };
			service.writeGlobalWorkspaces(workspacesData);

			expect(vol.existsSync('/home/testuser/.grove')).toBe(true);
		});
	});

	describe('addToGlobalTracking', () => {
		it('should add new workspace to tracking', () => {
			const workspace = {
				name: 'New Workspace',
				path: '/new-workspace',
				lastUsedAt: '2024-01-01T00:00:00Z',
			};

			service.addToGlobalTracking(workspace);

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(1);
			expect(result.workspaces[0]).toEqual(workspace);
		});

		it('should update existing workspace', () => {
			const workspace1 = {
				name: 'Workspace',
				path: '/workspace',
				lastUsedAt: '2024-01-01T00:00:00Z',
			};
			const workspace2 = {
				name: 'Updated Workspace',
				path: '/workspace',
				lastUsedAt: '2024-01-02T00:00:00Z',
			};

			service.addToGlobalTracking(workspace1);
			service.addToGlobalTracking(workspace2);

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(1);
			expect(result.workspaces[0].name).toBe('Updated Workspace');
			expect(result.workspaces[0].lastUsedAt).toBe('2024-01-02T00:00:00Z');
		});
	});

	describe('updateLastUsed', () => {
		it('should update lastUsedAt timestamp for existing workspace', () => {
			const workspace = {
				name: 'Workspace',
				path: '/workspace',
				lastUsedAt: '2024-01-01T00:00:00Z',
			};

			service.addToGlobalTracking(workspace);

			// Mock Date to return consistent timestamp
			const mockDate = '2024-01-15T12:00:00Z';
			vi.spyOn(global.Date.prototype, 'toISOString').mockReturnValue(mockDate);

			service.updateLastUsed('/workspace');

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces[0].lastUsedAt).toBe(mockDate);

			vi.restoreAllMocks();
		});

		it('should do nothing if workspace not found', () => {
			service.updateLastUsed('/nonexistent');

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(0);
		});
	});

	describe('removeFromGlobalTracking', () => {
		it('should remove workspace from tracking', () => {
			const workspace1 = {
				name: 'Workspace 1',
				path: '/workspace1',
				lastUsedAt: '2024-01-01T00:00:00Z',
			};
			const workspace2 = {
				name: 'Workspace 2',
				path: '/workspace2',
				lastUsedAt: '2024-01-02T00:00:00Z',
			};

			service.addToGlobalTracking(workspace1);
			service.addToGlobalTracking(workspace2);

			service.removeFromGlobalTracking('/workspace1');

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(1);
			expect(result.workspaces[0].path).toBe('/workspace2');
		});

		it('should do nothing if workspace not found', () => {
			const workspace = {
				name: 'Workspace',
				path: '/workspace',
				lastUsedAt: '2024-01-01T00:00:00Z',
			};

			service.addToGlobalTracking(workspace);
			service.removeFromGlobalTracking('/nonexistent');

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(1);
		});
	});

	describe('unified workspace/repo tracking', () => {
		it('should track repos and workspaces together with a type field', () => {
			service.addToGlobalTracking({
				name: 'MyWS',
				path: '/ws',
				type: 'workspace',
				lastUsedAt: '2024-01-01T00:00:00Z',
			});
			service.addToGlobalTracking({
				name: 'repo-a',
				path: '/repos/a',
				type: 'repo',
				lastUsedAt: '2024-01-02T00:00:00Z',
			});

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(2);
			expect(result.workspaces.find((w) => w.path === '/ws')?.type).toBe('workspace');
			expect(result.workspaces.find((w) => w.path === '/repos/a')?.type).toBe('repo');
		});

		it('should upsert by path, preserving the latest type and timestamp', () => {
			service.addToGlobalTracking({
				name: 'repo-a',
				path: '/repos/a',
				type: 'repo',
				lastUsedAt: '2024-01-01T00:00:00Z',
			});
			service.addToGlobalTracking({
				name: 'repo-a',
				path: '/repos/a',
				type: 'repo',
				lastUsedAt: '2024-02-02T00:00:00Z',
			});

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces).toHaveLength(1);
			expect(result.workspaces[0].lastUsedAt).toBe('2024-02-02T00:00:00Z');
		});

		it('should treat a missing type as a workspace (backward compatibility)', () => {
			service.addToGlobalTracking({
				name: 'legacy',
				path: '/legacy',
				lastUsedAt: '2024-01-01T00:00:00Z',
			});

			const result = service.readGlobalWorkspaces();
			expect(result.workspaces[0].type).toBeUndefined();
		});
	});

	describe('ensureLocationId', () => {
		it('generates and persists an id in the workspace config, stable across calls', () => {
			const wp = '/ws';
			vol.mkdirSync(path.join(wp, '.grove'), { recursive: true });
			service.writeWorkspaceConfig(wp, { name: 'W', version: '1.0.0', grovesFolder: './groves' });

			const id1 = service.ensureLocationId(service.resolveContext(wp));
			expect(id1).toBeTruthy();
			expect(service.readWorkspaceConfig(wp).id).toBe(id1);

			// Second launch returns the same id (no regeneration)
			const id2 = service.ensureLocationId(service.resolveContext(wp));
			expect(id2).toBe(id1);
		});

		it('generates and persists an id in <repo>/.grove/id.json for repos', () => {
			const rp = '/repo';
			vol.mkdirSync(path.join(rp, '.grove'), { recursive: true });

			const id1 = service.ensureLocationId(service.buildRepoContext(rp));
			const stored = JSON.parse(vol.readFileSync('/repo/.grove/id.json', 'utf-8') as string);
			expect(stored.id).toBe(id1);

			const id2 = service.ensureLocationId(service.buildRepoContext(rp));
			expect(id2).toBe(id1);
		});
	});

	describe('registerLocation', () => {
		const makeWorkspace = (p: string, id?: string) => {
			vol.mkdirSync(path.join(p, '.grove'), { recursive: true });
			service.writeWorkspaceConfig(p, {
				...(id ? { id } : {}),
				name: path.basename(p),
				version: '1.0.0',
				grovesFolder: './groves',
			});
		};

		it('registers a single record for the launched workspace', () => {
			makeWorkspace('/a', 'fixed-id');
			service.registerLocation(service.resolveContext('/a'));

			const recs = service.readGlobalWorkspaces().workspaces;
			expect(recs).toHaveLength(1);
			expect(recs[0]).toMatchObject({ id: 'fixed-id', path: '/a', type: 'workspace' });
		});

		it('updates the record path (no duplicate) when launched from a new path with the same id', () => {
			makeWorkspace('/a', 'fixed-id');
			service.registerLocation(service.resolveContext('/a'));

			// Same workspace (same id) now lives at /b
			makeWorkspace('/b', 'fixed-id');
			service.registerLocation(service.resolveContext('/b'));

			const recs = service.readGlobalWorkspaces().workspaces;
			expect(recs).toHaveLength(1);
			expect(recs[0].path).toBe('/b');
			expect(recs[0].id).toBe('fixed-id');
		});

		it('migrates a legacy record without an id by generating and attaching one', () => {
			service.addToGlobalTracking({
				name: 'leg',
				path: '/leg',
				type: 'workspace',
				lastUsedAt: '2024-01-01T00:00:00Z',
			});
			makeWorkspace('/leg'); // no id in config yet

			service.registerLocation(service.resolveContext('/leg'));

			const recs = service.readGlobalWorkspaces().workspaces.filter((w) => w.path === '/leg');
			expect(recs).toHaveLength(1);
			expect(recs[0].id).toBeTruthy();
			// id was also written back to the workspace config
			expect(service.readWorkspaceConfig('/leg').id).toBe(recs[0].id);
		});
	});

	describe('getGlobalContext', () => {
		it('should return a global context pointing at the global grove folder', () => {
			const context = service.getGlobalContext();

			expect(context.type).toBe('global');
			expect(context.groveFolder).toBe('/home/testuser/.grove');
			expect(context.workspacePath).toBeUndefined();
		});
	});

	describe('buildRepoContext', () => {
		it('should build a repo context from a path without git detection', () => {
			const context = service.buildRepoContext('/repos/my-repo');

			expect(context.type).toBe('repo');
			expect(context.repoPath).toBe('/repos/my-repo');
			expect(context.repoName).toBe('my-repo');
			expect(context.groveFolder).toBe(path.join('/repos/my-repo', '.grove'));
			expect(context.grovesFolder).toBe(path.join('/repos/my-repo', '.grove', 'groves'));
		});
	});

	describe('isWorkspaceRoot', () => {
		it('should return true when workspace config exists', () => {
			const workspacePath = '/workspace';
			vol.mkdirSync(workspacePath, { recursive: true });
			vol.writeFileSync(
				path.join(workspacePath, '.grove.workspace.json'),
				JSON.stringify({ name: 'test', version: '1.0.0', grovesFolder: './groves' })
			);

			const result = service.isWorkspaceRoot(workspacePath);

			expect(result).toBe(true);
		});

		it('should return false when workspace config does not exist', () => {
			const workspacePath = '/workspace';
			vol.mkdirSync(workspacePath, { recursive: true });

			const result = service.isWorkspaceRoot(workspacePath);

			expect(result).toBe(false);
		});
	});

	describe('setCurrentContext and getCurrentContext', () => {
		it('should store and retrieve workspace context', () => {
			const context: WorkspaceContext = {
				type: 'workspace',
				config: {
					name: 'Test Workspace',
					version: '1.0.0',
					grovesFolder: './groves',
				},
				workspacePath: '/workspace',
				groveFolder: '/workspace/.grove',
				grovesFolder: '/workspace/groves',
			};

			service.setCurrentContext(context);
			const result = service.getCurrentContext();

			expect(result).toEqual(context);
		});

		it('should store and retrieve global context', () => {
			const context: WorkspaceContext = {
				type: 'global',
				groveFolder: '/home/testuser/.grove',
			};

			service.setCurrentContext(context);
			const result = service.getCurrentContext();

			expect(result).toEqual(context);
		});

		it('should return undefined when no context set', () => {
			const result = service.getCurrentContext();

			expect(result).toBeUndefined();
		});

		it('should overwrite previous context', () => {
			const context1: WorkspaceContext = {
				type: 'workspace',
				config: {
					name: 'Workspace 1',
					version: '1.0.0',
					grovesFolder: './groves',
				},
				workspacePath: '/workspace1',
				groveFolder: '/workspace1/.grove',
				grovesFolder: '/workspace1/groves',
			};

			const context2: WorkspaceContext = {
				type: 'workspace',
				config: {
					name: 'Workspace 2',
					version: '1.0.0',
					grovesFolder: './groves',
				},
				workspacePath: '/workspace2',
				groveFolder: '/workspace2/.grove',
				grovesFolder: '/workspace2/groves',
			};

			service.setCurrentContext(context1);
			service.setCurrentContext(context2);

			const result = service.getCurrentContext();
			expect(result).toEqual(context2);
		});
	});
});
