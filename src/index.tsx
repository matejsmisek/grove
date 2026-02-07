#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import {
	addWorktree,
	createGrove,
	handleSessionHook,
	initWorkspace,
	openClaude,
	registerRepository,
	setupAgentHooks,
	verifyAgentHooks,
} from './commands/index.js';
import { App } from './components/App.js';
import { getContainer } from './di/index.js';
import {
	SessionsServiceToken,
	WorkspaceService,
	WorkspaceServiceToken,
	detectTerminal,
	initializeServices,
} from './services/index.js';
import { AgentType, SettingsService } from './storage/index.js';

// Discover workspace context
const workspaceService = new WorkspaceService();
const workspaceContext = workspaceService.resolveContext(process.cwd());

// Create workspace-aware settings service
const settingsService = new SettingsService(workspaceContext);

// Initialize storage before rendering the app
// If in a workspace, this will initialize the workspace's .grove folder
// If global, this will initialize ~/.grove
settingsService.initializeStorage();

// Initialize DI services with workspace context FIRST
// This must happen before any commands are executed
initializeServices(undefined, workspaceContext);

// Set the workspace context in the DI container's WorkspaceService
// so it can be accessed by components
const container = getContainer();
const workspaceServiceFromDI = container.resolve(WorkspaceServiceToken);
workspaceServiceFromDI.setCurrentContext(workspaceContext);

// Detect terminal on first startup if not already configured
const settings = settingsService.readSettings();
if (!settings.terminal) {
	const terminalConfig = detectTerminal(settings.selectedClaudeTerminal);
	if (terminalConfig) {
		settingsService.updateSettings({ terminal: terminalConfig });
	}
}

// Parse command-line arguments
const args = process.argv.slice(2);

// Handle workspace commands
if (args[0] === 'workspace' && args[1] === 'init') {
	(async () => {
		const result = await initWorkspace();

		if (result.success) {
			console.log('✓', result.message);
			if (result.workspacePath) {
				console.log('  Workspace path:', result.workspacePath);
			}
			if (result.grovesFolder) {
				console.log('  Groves folder:', result.grovesFolder);
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args[0] === 'create') {
	// Handle create command: grove create <name> [repository]
	// Name can have spaces - all args between 'create' and last non-repo arg are joined as the name
	// If --empty flag is present, creates grove without worktrees
	// Last argument is the repository (unless --empty is used)
	(async () => {
		const createArgs = args.slice(1);
		const isEmpty = createArgs.includes('--empty');
		const filteredArgs = createArgs.filter((a) => a !== '--empty');

		if (filteredArgs.length < 1) {
			console.error('✗ Usage: grove create <name> [repository]');
			console.error('  grove create <name> --empty');
			console.error('  repository format: reponame or reponame.projectfolder');
			process.exit(1);
		}

		let name: string;
		let repository: string | undefined;

		if (isEmpty) {
			// All remaining args form the name
			name = filteredArgs.join(' ');
		} else if (filteredArgs.length < 2) {
			console.error('✗ Usage: grove create <name> <repository>');
			console.error('  grove create <name> --empty');
			console.error('  repository format: reponame or reponame.projectfolder');
			process.exit(1);
		} else {
			repository = filteredArgs[filteredArgs.length - 1];
			name = filteredArgs.slice(0, -1).join(' ');
		}

		const result = await createGrove(name, repository);

		if (result.success) {
			console.log('✓', result.message);
			if (result.grovePath) {
				console.log('  Path:', result.grovePath);
			}
			if (result.groveId) {
				console.log('  ID:', result.groveId);
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args[0] === 'add-worktree') {
	// Handle add-worktree command: grove add-worktree <grove-id> <name> <repository>
	// Adds a worktree to an existing grove
	(async () => {
		const addArgs = args.slice(1);
		if (addArgs.length < 3) {
			console.error('✗ Usage: grove add-worktree <grove-id> <name> <repository>');
			console.error('  repository format: reponame or reponame.projectfolder');
			process.exit(1);
		}

		const groveId = addArgs[0];
		const repository = addArgs[addArgs.length - 1];
		const worktreeName = addArgs.slice(1, -1).join(' ');

		const result = await addWorktree(groveId, worktreeName, repository);

		if (result.success) {
			console.log('✓', result.message);
			if (result.worktreePath) {
				console.log('  Path:', result.worktreePath);
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args[0] === 'claude') {
	// Handle claude command: grove claude [grove-id]
	const groveId = args[1]; // Optional grove ID
	const result = openClaude(groveId);

	if (result.success) {
		console.log('✓', result.message);
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (args.includes('--register')) {
	// Handle --register flag
	const result = registerRepository();

	if (result.success) {
		console.log('✓', result.message);
		if (result.path) {
			console.log('  Path:', result.path);
		}
		process.exit(0);
	} else {
		console.error('✗', result.message);
		process.exit(1);
	}
} else if (args.includes('session-hook')) {
	// Handle unified session-hook command (reads JSON from stdin)
	(async () => {
		const agentType = (getArgValue('--agent-type') || 'claude') as AgentType;
		const sessionsService = container.resolve(SessionsServiceToken);
		const result = await handleSessionHook(sessionsService, agentType);

		if (result.success) {
			// Silent success for hooks - don't clutter output
			process.exit(0);
		} else {
			console.error('✗', result.message);
			process.exit(1);
		}
	})();
} else if (args.includes('--setup-hooks')) {
	// Handle setup-hooks command
	(async () => {
		const agentType = (getArgValue('--agent') || 'claude') as AgentType;
		const result = await setupAgentHooks(agentType);

		if (result.success) {
			console.log('✓', result.message);
			if (result.details && result.details.length > 0) {
				result.details.forEach((detail) => console.log('  ', detail));
			}
			process.exit(0);
		} else {
			console.error('✗', result.message);
			if (result.details && result.details.length > 0) {
				result.details.forEach((detail) => console.error('  ', detail));
			}
			process.exit(1);
		}
	})();
} else if (args.includes('--verify-hooks')) {
	// Handle verify-hooks command
	(async () => {
		const agentType = (getArgValue('--agent') || 'claude') as AgentType;
		const result = await verifyAgentHooks(agentType);

		console.log(`Agent: ${agentType}`);
		console.log(`Configured: ${result.configured ? 'Yes' : 'No'}`);
		if (result.hooks.length > 0) {
			console.log(`Active hooks: ${result.hooks.join(', ')}`);
		}
		if (result.missing.length > 0) {
			console.log(`Missing hooks: ${result.missing.join(', ')}`);
		}

		process.exit(result.configured ? 0 : 1);
	})();
} else {
	// Clear terminal to give app full height
	console.clear();
	// Start the interactive UI
	render(<App />);
}

/**
 * Helper function to get argument value
 */
function getArgValue(flag: string): string {
	const index = args.indexOf(flag);
	if (index === -1 || index === args.length - 1) {
		console.error(`Missing value for ${flag}`);
		process.exit(1);
	}
	return args[index + 1];
}
