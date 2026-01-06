#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import { initWorkspace, registerRepository } from './commands/index.js';
import { App } from './components/App.js';
import { WorkspaceService, detectTerminal, initializeServices } from './services/index.js';
import { SettingsService } from './storage/index.js';

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

// Detect terminal on first startup if not already configured
const settings = settingsService.readSettings();
if (!settings.terminal) {
	const terminalConfig = detectTerminal();
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
