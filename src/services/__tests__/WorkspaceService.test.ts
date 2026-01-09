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

		it('should find closest workspace when workspaces are nested', () => {
			const parentWorkspace = '/workspace';
			const nestedWorkspace = '/workspace/nested';
			const deepDir = '/workspace/nested/deep/folder';

			// Create parent workspace
			vol.mkdirSync(parentWorkspace, { recursive: true });
			vol.writeFileSync(
				path.join(parentWorkspace, '.grove.workspace.json'),
				JSON.stringify({ name: 'parent', version: '1.0.0', grovesFolder: './groves' })
			);

			// Create nested workspace
			vol.mkdirSync(nestedWorkspace, { recursive: true });
			vol.writeFileSync(
				path.join(nestedWorkspace, '.grove.workspace.json'),
				JSON.stringify({ name: 'nested', version: '1.0.0', grovesFolder: './groves' })
			);

			vol.mkdirSync(deepDir, { recursive: true });

			// From deep directory, should find nested workspace (closest one)
			const result = service.discoverWorkspace(deepDir);

			expect(result).toBe(nestedWorkspace);
		});

		it('should find parent workspace when not in nested workspace directory', () => {
			const parentWorkspace = '/workspace';
			const nestedWorkspace = '/workspace/nested';
			const siblingDir = '/workspace/sibling';

			// Create parent workspace
			vol.mkdirSync(parentWorkspace, { recursive: true });
			vol.writeFileSync(
				path.join(parentWorkspace, '.grove.workspace.json'),
				JSON.stringify({ name: 'parent', version: '1.0.0', grovesFolder: './groves' })
			);

			// Create nested workspace
			vol.mkdirSync(nestedWorkspace, { recursive: true });
			vol.writeFileSync(
				path.join(nestedWorkspace, '.grove.workspace.json'),
				JSON.stringify({ name: 'nested', version: '1.0.0', grovesFolder: './groves' })
			);

			// Create sibling directory (not under nested)
			vol.mkdirSync(siblingDir, { recursive: true });

			// From sibling directory, should find parent workspace
			const result = service.discoverWorkspace(siblingDir);

			expect(result).toBe(parentWorkspace);
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

		it('should allow creating nested workspaces', () => {
			const parentWorkspace = '/workspace';
			const nestedWorkspace = '/workspace/nested';

			vol.mkdirSync(parentWorkspace, { recursive: true });
			vol.mkdirSync(nestedWorkspace, { recursive: true });

			// Initialize parent workspace
			service.initWorkspace(parentWorkspace, 'Parent Workspace', './groves');

			// Initialize nested workspace inside parent
			service.initWorkspace(nestedWorkspace, 'Nested Workspace', './nested-groves');

			// Verify both workspaces exist
			expect(vol.existsSync(path.join(parentWorkspace, '.grove.workspace.json'))).toBe(true);
			expect(vol.existsSync(path.join(nestedWorkspace, '.grove.workspace.json'))).toBe(true);

			// Verify both are tracked globally
			const globalWorkspaces = service.readGlobalWorkspaces();
			expect(globalWorkspaces.workspaces).toHaveLength(2);

			// Verify nested workspace has its own .grove folder
			expect(vol.existsSync(path.join(nestedWorkspace, '.grove'))).toBe(true);
			expect(vol.existsSync(path.join(nestedWorkspace, 'nested-groves'))).toBe(true);
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

		it('should return global context when not in a workspace', () => {
			const dir = '/no-workspace';
			vol.mkdirSync(dir, { recursive: true });

			const result = service.resolveContext(dir);

			expect(result.type).toBe('global');
			expect(result.groveFolder).toBe('/home/testuser/.grove');
			expect(result.config).toBeUndefined();
			expect(result.workspacePath).toBeUndefined();
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
