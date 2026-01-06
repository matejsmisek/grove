#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import { initWorkspace, registerRepository } from './commands/index.js';
import { App } from './components/App.js';
import { WorkspaceService, detectTerminal, initializeServices } from './services/index.js';
import { initializeStorage, readSettings, updateSettings } from './storage/index.js';

// Discover workspace context
const workspaceService = new WorkspaceService();
const workspaceContext = workspaceService.resolveContext(process.cwd());

// Initialize storage before rendering the app
// If in a workspace, this will initialize the workspace's .grove folder
// If global, this will initialize ~/.grove
initializeStorage();

// Detect terminal on first startup if not already configured
const settings = readSettings();
if (!settings.terminal) {
	const terminalConfig = detectTerminal();
	if (terminalConfig) {
		updateSettings({ terminal: terminalConfig });
	}
}

// Initialize DI services with workspace context
initializeServices(undefined, workspaceContext);

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
} else {
	// Start the interactive UI
	render(<App />);
}
