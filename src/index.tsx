#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import { registerRepository } from './commands/index.js';
import { App } from './components/App.js';
import { initializeStorage } from './storage/index.js';

// Initialize storage before rendering the app
initializeStorage();

// Parse command-line arguments
const args = process.argv.slice(2);

// Handle --register flag
if (args.includes('--register')) {
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
}

// Start the interactive UI
render(<App />);
