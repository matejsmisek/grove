import fs from 'fs';
import path from 'path';
import * as readline from 'readline';

import { WorkspaceService } from '../services/WorkspaceService.js';
import type { WorkspaceInitResult } from './types.js';

/**
 * Initialize a new workspace in the current directory
 * Prompts user for workspace name and groves folder
 * @param cwd - Current working directory (defaults to process.cwd())
 */
export async function initWorkspace(cwd?: string): Promise<WorkspaceInitResult> {
	const workingDir = cwd || process.cwd();
	const workspaceService = new WorkspaceService();

	try {
		// Check if already in a workspace
		const existingWorkspace = workspaceService.discoverWorkspace(workingDir);
		if (existingWorkspace) {
			const config = workspaceService.readWorkspaceConfig(existingWorkspace);
			return {
				success: false,
				message: `Already in workspace "${config.name}" at ${existingWorkspace}`,
			};
		}

		// Check if .grove.workspace.json already exists in current directory
		if (workspaceService.isWorkspaceRoot(workingDir)) {
			return {
				success: false,
				message: 'Workspace configuration already exists in this directory',
			};
		}

		// Create readline interface for prompts
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		// Prompt for workspace name
		const name = await new Promise<string>((resolve) => {
			rl.question('Workspace name: ', (answer) => {
				resolve(answer.trim());
			});
		});

		if (!name) {
			rl.close();
			return {
				success: false,
				message: 'Workspace name is required',
			};
		}

		// Prompt for groves folder with default
		const defaultGrovesFolder = path.join(workingDir, 'groves');
		const grovesFolderInput = await new Promise<string>((resolve) => {
			rl.question(`Groves folder [${defaultGrovesFolder}]: `, (answer) => {
				resolve(answer.trim());
			});
		});

		rl.close();

		// Use default if no input provided
		const grovesFolder = grovesFolderInput || defaultGrovesFolder;

		// Resolve relative path to absolute
		const absoluteGrovesFolder = path.isAbsolute(grovesFolder)
			? grovesFolder
			: path.resolve(workingDir, grovesFolder);

		// Check if groves folder exists or can be created
		if (fs.existsSync(absoluteGrovesFolder) && !fs.statSync(absoluteGrovesFolder).isDirectory()) {
			return {
				success: false,
				message: `Groves folder path exists but is not a directory: ${absoluteGrovesFolder}`,
			};
		}

		// Initialize workspace
		// Convert absolute path back to relative for storage if it's under workspace
		const relativeGrovesFolder = path.relative(workingDir, absoluteGrovesFolder);
		const storedGrovesFolder =
			relativeGrovesFolder && !relativeGrovesFolder.startsWith('..')
				? `./${relativeGrovesFolder}`
				: absoluteGrovesFolder;

		workspaceService.initWorkspace(workingDir, name, storedGrovesFolder);

		return {
			success: true,
			message: `Workspace "${name}" initialized successfully`,
			workspacePath: workingDir,
			grovesFolder: absoluteGrovesFolder,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return {
			success: false,
			message: `Failed to initialize workspace: ${errorMessage}`,
		};
	}
}
