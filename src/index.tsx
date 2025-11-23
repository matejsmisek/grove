#!/usr/bin/env node
import React from 'react';

import { render } from 'ink';

import { App } from './components/App.js';
import { initializeStorage } from './storage/index.js';

// Initialize storage before rendering the app
initializeStorage();

render(<App />);
