import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type { ISettingsService } from './interfaces.js';
import type {
	ClaudeSessionResult,
	ClaudeTerminalType,
	IClaudeSessionService,
} from './interfaces.js';

/**
 * Claude Session Service
 * Launches Claude CLI in terminal sessions with multiple tabs (konsole or kitty)
 */
export class ClaudeSessionService implements IClaudeSessionService {
	constructor(private readonly settingsService: ISettingsService) {}

	/**
	 * Check if a command exists in the system PATH
	 */
	private commandExists(command: string): boolean {
		try {
			execSync(`which ${command}`, { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Detect which supported terminal is available (konsole or kitty)
	 */
	detectTerminal(): ClaudeTerminalType | null {
		if (this.commandExists('konsole')) {
			return 'konsole';
		}
		if (this.commandExists('kitty')) {
			return 'kitty';
		}
		return null;
	}

	/**
	 * Get the path to the tmp directory inside .grove folder
	 */
	private getTmpDir(): string {
		const config = this.settingsService.getStorageConfig();
		return path.join(config.groveFolder, 'tmp');
	}

	/**
	 * Ensure the tmp directory exists
	 */
	private ensureTmpDir(): void {
		const tmpDir = this.getTmpDir();
		if (!fs.existsSync(tmpDir)) {
			fs.mkdirSync(tmpDir, { recursive: true });
		}
	}

	/**
	 * Generate konsole tabs file content
	 */
	private generateKonsoleTabs(workingDir: string): string {
		return `title: Claude ;; workdir: ${workingDir} ;; command: claude
title: cmd ;; workdir: ${workingDir} ;; command: bash
`;
	}

	/**
	 * Generate kitty session file content
	 */
	private generateKittySession(workingDir: string): string {
		return `layout tall
cd ${workingDir}
layout tall:bias=65;full_size=1
launch --title "claude" claude
launch --title "cmd" bash
`;
	}

	/**
	 * Open Claude in a terminal session with the working directory set
	 */
	openSession(workingDir: string): ClaudeSessionResult {
		const terminal = this.detectTerminal();

		if (!terminal) {
			return {
				success: false,
				message: 'No supported terminal found. This feature requires KDE Konsole or Kitty.',
			};
		}

		// Check if claude command is available
		if (!this.commandExists('claude')) {
			return {
				success: false,
				message: 'Claude CLI not found. Please install Claude CLI first.',
			};
		}

		try {
			this.ensureTmpDir();

			// Generate unique filename for the session file
			const sessionId = crypto.randomBytes(8).toString('hex');
			const tmpDir = this.getTmpDir();

			if (terminal === 'konsole') {
				return this.launchKonsole(workingDir, tmpDir, sessionId);
			} else {
				return this.launchKitty(workingDir, tmpDir, sessionId);
			}
		} catch (error) {
			return {
				success: false,
				message: `Failed to open Claude session: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Launch konsole with tabs file
	 */
	private launchKonsole(workingDir: string, tmpDir: string, sessionId: string): ClaudeSessionResult {
		const tabsFile = path.join(tmpDir, `konsole-tabs-${sessionId}.txt`);

		// Write the tabs file
		fs.writeFileSync(tabsFile, this.generateKonsoleTabs(workingDir), 'utf-8');

		// Launch konsole with the tabs file
		const proc = spawn('konsole', ['--tabs-from-file', tabsFile, '-e', 'bash', '-c', 'exit'], {
			detached: true,
			stdio: 'ignore',
		});

		proc.on('error', (err) => {
			console.error(`[ClaudeSessionService] spawn error: ${err.message}`);
		});

		proc.unref();

		// Delete the temp file after a short delay to allow konsole to read it
		setTimeout(() => {
			try {
				if (fs.existsSync(tabsFile)) {
					fs.unlinkSync(tabsFile);
				}
			} catch {
				// Ignore deletion errors
			}
		}, 2000);

		return {
			success: true,
			message: `Opened Claude session in ${workingDir}`,
		};
	}

	/**
	 * Launch kitty with session file
	 */
	private launchKitty(workingDir: string, tmpDir: string, sessionId: string): ClaudeSessionResult {
		const sessionFile = path.join(tmpDir, `kitty-session-${sessionId}.conf`);

		// Write the session file
		fs.writeFileSync(sessionFile, this.generateKittySession(workingDir), 'utf-8');

		// Launch kitty with the session file
		const proc = spawn('kitty', ['--session', sessionFile], {
			detached: true,
			stdio: 'ignore',
		});

		proc.on('error', (err) => {
			console.error(`[ClaudeSessionService] spawn error: ${err.message}`);
		});

		proc.unref();

		// Delete the temp file after a short delay to allow kitty to read it
		setTimeout(() => {
			try {
				if (fs.existsSync(sessionFile)) {
					fs.unlinkSync(sessionFile);
				}
			} catch {
				// Ignore deletion errors
			}
		}, 2000);

		return {
			success: true,
			message: `Opened Claude session in ${workingDir}`,
		};
	}
}
