import fs from 'fs';
import os from 'os';
import path from 'path';

import type {
	WorkspaceConfig,
	WorkspaceContext,
	WorkspaceReference,
	WorkspacesData,
} from '../storage/types.js';

const WORKSPACE_CONFIG_FILENAME = '.grove.workspace.json';
const WORKSPACE_GROVE_FOLDER = '.grove';
const GLOBAL_WORKSPACES_FILENAME = 'workspaces.json';

/**
 * Workspace service interface
 * Manages Grove workspaces - localized configurations with their own repositories and groves
 */
export interface IWorkspaceService {
	/** Discover workspace by walking up directory tree from startDir */
	discoverWorkspace(startDir: string): string | undefined;
	/** Read workspace configuration from .grove.workspace.json */
	readWorkspaceConfig(workspacePath: string): WorkspaceConfig;
	/** Write workspace configuration to .grove.workspace.json */
	writeWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): void;
	/** Initialize a new workspace in the given directory */
	initWorkspace(workspacePath: string, name: string, grovesFolder: string): void;
	/** Resolve workspace context from current directory */
	resolveContext(cwd: string): WorkspaceContext;
	/** Read global workspaces tracking file */
	readGlobalWorkspaces(): WorkspacesData;
	/** Write global workspaces tracking file */
	writeGlobalWorkspaces(data: WorkspacesData): void;
	/** Add or update workspace in global tracking */
	addToGlobalTracking(workspace: WorkspaceReference): void;
	/** Update last used timestamp for a workspace */
	updateLastUsed(workspacePath: string): void;
	/** Remove workspace from global tracking */
	removeFromGlobalTracking(workspacePath: string): void;
	/** Check if a directory is a workspace root */
	isWorkspaceRoot(dirPath: string): boolean;
	/** Set the current workspace context */
	setCurrentContext(context: WorkspaceContext): void;
	/** Get the current workspace context */
	getCurrentContext(): WorkspaceContext | undefined;
}

/**
 * Service for managing Grove workspaces
 * Handles workspace discovery, initialization, and context resolution
 */
export class WorkspaceService implements IWorkspaceService {
	private currentContext?: WorkspaceContext;

	/**
	 * Discover workspace by walking up directory tree from startDir
	 * Returns workspace path if found, undefined otherwise
	 */
	discoverWorkspace(startDir: string): string | undefined {
		let currentDir = path.resolve(startDir);
		const root = path.parse(currentDir).root;

		while (currentDir !== root) {
			const workspaceConfigPath = path.join(currentDir, WORKSPACE_CONFIG_FILENAME);
			if (fs.existsSync(workspaceConfigPath)) {
				return currentDir;
			}
			currentDir = path.dirname(currentDir);
		}

		// Check root directory
		const rootConfigPath = path.join(root, WORKSPACE_CONFIG_FILENAME);
		if (fs.existsSync(rootConfigPath)) {
			return root;
		}

		return undefined;
	}

	/**
	 * Read workspace configuration from .grove.workspace.json
	 */
	readWorkspaceConfig(workspacePath: string): WorkspaceConfig {
		const configPath = path.join(workspacePath, WORKSPACE_CONFIG_FILENAME);

		if (!fs.existsSync(configPath)) {
			throw new Error(`Workspace configuration not found at ${configPath}`);
		}

		const data = fs.readFileSync(configPath, 'utf-8');
		return JSON.parse(data) as WorkspaceConfig;
	}

	/**
	 * Write workspace configuration to .grove.workspace.json
	 */
	writeWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): void {
		const configPath = path.join(workspacePath, WORKSPACE_CONFIG_FILENAME);
		const data = JSON.stringify(config, null, '\t');
		fs.writeFileSync(configPath, data, 'utf-8');
	}

	/**
	 * Initialize a new workspace in the given directory
	 * Creates .grove.workspace.json and .grove/ folder structure
	 */
	initWorkspace(workspacePath: string, name: string, grovesFolder: string): void {
		// Create workspace configuration
		const config: WorkspaceConfig = {
			name,
			version: '1.0.0',
			grovesFolder,
		};

		// Write .grove.workspace.json
		this.writeWorkspaceConfig(workspacePath, config);

		// Create .grove folder structure
		const groveFolder = path.join(workspacePath, WORKSPACE_GROVE_FOLDER);
		if (!fs.existsSync(groveFolder)) {
			fs.mkdirSync(groveFolder, { recursive: true });
		}

		// Create empty data files
		const repositoriesPath = path.join(groveFolder, 'repositories.json');
		if (!fs.existsSync(repositoriesPath)) {
			fs.writeFileSync(repositoriesPath, JSON.stringify({ repositories: [] }, null, '\t'));
		}

		const grovesPath = path.join(groveFolder, 'groves.json');
		if (!fs.existsSync(grovesPath)) {
			fs.writeFileSync(grovesPath, JSON.stringify({ groves: [] }, null, '\t'));
		}

		const settingsPath = path.join(groveFolder, 'settings.json');
		if (!fs.existsSync(settingsPath)) {
			// Resolve groves folder to absolute path
			const absoluteGrovesFolder = path.isAbsolute(grovesFolder)
				? grovesFolder
				: path.resolve(workspacePath, grovesFolder);

			fs.writeFileSync(
				settingsPath,
				JSON.stringify({ workingFolder: absoluteGrovesFolder }, null, '\t')
			);
		}

		const recentPath = path.join(groveFolder, 'recent.json');
		if (!fs.existsSync(recentPath)) {
			fs.writeFileSync(recentPath, JSON.stringify({ selections: [] }, null, '\t'));
		}

		// Create groves folder if it doesn't exist
		const absoluteGrovesFolder = path.isAbsolute(grovesFolder)
			? grovesFolder
			: path.resolve(workspacePath, grovesFolder);
		if (!fs.existsSync(absoluteGrovesFolder)) {
			fs.mkdirSync(absoluteGrovesFolder, { recursive: true });
		}

		// Add workspace to global tracking
		this.addToGlobalTracking({
			name,
			path: workspacePath,
			lastUsedAt: new Date().toISOString(),
		});
	}

	/**
	 * Resolve workspace context from current directory
	 * Returns workspace context if in a workspace, or global context otherwise
	 */
	resolveContext(cwd: string): WorkspaceContext {
		const workspacePath = this.discoverWorkspace(cwd);

		if (workspacePath) {
			// In a workspace
			const config = this.readWorkspaceConfig(workspacePath);
			const groveFolder = path.join(workspacePath, WORKSPACE_GROVE_FOLDER);

			// Resolve groves folder from config
			const grovesFolder = path.isAbsolute(config.grovesFolder)
				? config.grovesFolder
				: path.resolve(workspacePath, config.grovesFolder);

			// Update last used timestamp in global tracking
			this.updateLastUsed(workspacePath);

			return {
				type: 'workspace',
				config,
				workspacePath,
				groveFolder,
				grovesFolder,
			};
		} else {
			// Global context
			const homeDir = os.homedir();
			const groveFolder = path.join(homeDir, '.grove');

			return {
				type: 'global',
				groveFolder,
				// grovesFolder will be read from settings later
			};
		}
	}

	/**
	 * Get path to global workspaces.json file
	 */
	private getGlobalWorkspacesPath(): string {
		const homeDir = os.homedir();
		const groveFolder = path.join(homeDir, '.grove');
		return path.join(groveFolder, GLOBAL_WORKSPACES_FILENAME);
	}

	/**
	 * Read global workspaces tracking file
	 */
	readGlobalWorkspaces(): WorkspacesData {
		const workspacesPath = this.getGlobalWorkspacesPath();

		if (!fs.existsSync(workspacesPath)) {
			return { workspaces: [] };
		}

		try {
			const data = fs.readFileSync(workspacesPath, 'utf-8');
			return JSON.parse(data) as WorkspacesData;
		} catch (error) {
			console.error('Error reading global workspaces:', error);
			return { workspaces: [] };
		}
	}

	/**
	 * Write global workspaces tracking file
	 */
	writeGlobalWorkspaces(data: WorkspacesData): void {
		const workspacesPath = this.getGlobalWorkspacesPath();
		const homeDir = os.homedir();
		const groveFolder = path.join(homeDir, '.grove');

		// Ensure .grove folder exists
		if (!fs.existsSync(groveFolder)) {
			fs.mkdirSync(groveFolder, { recursive: true });
		}

		const jsonData = JSON.stringify(data, null, '\t');
		fs.writeFileSync(workspacesPath, jsonData, 'utf-8');
	}

	/**
	 * Add or update workspace in global tracking
	 */
	addToGlobalTracking(workspace: WorkspaceReference): void {
		const data = this.readGlobalWorkspaces();

		// Check if workspace already exists
		const existingIndex = data.workspaces.findIndex((w) => w.path === workspace.path);

		if (existingIndex >= 0) {
			// Update existing workspace
			data.workspaces[existingIndex] = workspace;
		} else {
			// Add new workspace
			data.workspaces.push(workspace);
		}

		this.writeGlobalWorkspaces(data);
	}

	/**
	 * Update last used timestamp for a workspace
	 */
	updateLastUsed(workspacePath: string): void {
		const data = this.readGlobalWorkspaces();
		const workspace = data.workspaces.find((w) => w.path === workspacePath);

		if (workspace) {
			workspace.lastUsedAt = new Date().toISOString();
			this.writeGlobalWorkspaces(data);
		}
	}

	/**
	 * Remove workspace from global tracking
	 */
	removeFromGlobalTracking(workspacePath: string): void {
		const data = this.readGlobalWorkspaces();
		data.workspaces = data.workspaces.filter((w) => w.path !== workspacePath);
		this.writeGlobalWorkspaces(data);
	}

	/**
	 * Check if a directory is a workspace root
	 */
	isWorkspaceRoot(dirPath: string): boolean {
		const configPath = path.join(dirPath, WORKSPACE_CONFIG_FILENAME);
		return fs.existsSync(configPath);
	}

	/**
	 * Set the current workspace context
	 * Should be called after resolving context in the application entry point
	 */
	setCurrentContext(context: WorkspaceContext): void {
		this.currentContext = context;
	}

	/**
	 * Get the current workspace context
	 * Returns the workspace context set during application initialization
	 */
	getCurrentContext(): WorkspaceContext | undefined {
		return this.currentContext;
	}
}
