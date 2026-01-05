import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Create a temporary directory for testing
 */
export function createTempDir(prefix = 'grove-test-'): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dirPath: string): void {
	if (fs.existsSync(dirPath)) {
		fs.rmSync(dirPath, { recursive: true, force: true });
	}
}

/**
 * Create a mock git repository structure
 */
export function createMockGitRepo(basePath: string): string {
	const repoPath = path.join(basePath, 'test-repo');
	fs.mkdirSync(repoPath, { recursive: true });
	fs.mkdirSync(path.join(repoPath, '.git'));

	// Create a basic git config file
	fs.writeFileSync(
		path.join(repoPath, '.git', 'config'),
		'[core]\n\trepositoryformatversion = 0\n',
	);

	return repoPath;
}

/**
 * Create a file with content at the given path
 */
export function createFile(filePath: string, content: string): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filePath, content);
}

/**
 * Read file contents
 */
export function readFile(filePath: string): string {
	return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
	return fs.existsSync(filePath);
}

/**
 * Create a mock .grove.json config file
 */
export function createMockGroveConfig(repoPath: string, config: unknown): void {
	const configPath = path.join(repoPath, '.grove.json');
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
