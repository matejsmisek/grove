import * as path from 'path';
import { Volume, createFsFromVolume } from 'memfs';

/**
 * Create a new in-memory filesystem volume for testing
 * Returns the volume and fs instance
 */
export function createMockFs() {
	const vol = new Volume();
	const fs = createFsFromVolume(vol);
	return { vol, fs };
}

/**
 * Setup a mock home directory structure in the volume
 * @param vol - memfs Volume instance
 * @param homeDir - Path to use as home directory (e.g., '/home/testuser')
 */
export function setupMockHomeDir(vol: Volume, homeDir: string): void {
	vol.mkdirSync(homeDir, { recursive: true });
	vol.mkdirSync(path.join(homeDir, '.grove'), { recursive: true });
}

/**
 * Create a mock git repository structure
 */
export function createMockGitRepo(vol: Volume, basePath: string): string {
	const repoPath = path.join(basePath, 'test-repo');
	vol.mkdirSync(repoPath, { recursive: true });
	vol.mkdirSync(path.join(repoPath, '.git'), { recursive: true });

	// Create a basic git config file
	vol.writeFileSync(
		path.join(repoPath, '.git', 'config'),
		'[core]\n\trepositoryformatversion = 0\n',
	);

	return repoPath;
}

/**
 * Create a file with content at the given path
 */
export function createFile(vol: Volume, filePath: string, content: string): void {
	const dir = path.dirname(filePath);
	if (!vol.existsSync(dir)) {
		vol.mkdirSync(dir, { recursive: true });
	}
	vol.writeFileSync(filePath, content);
}

/**
 * Read file contents
 */
export function readFile(vol: Volume, filePath: string): string {
	return vol.readFileSync(filePath, 'utf-8') as string;
}

/**
 * Check if file exists
 */
export function fileExists(vol: Volume, filePath: string): boolean {
	return vol.existsSync(filePath);
}

/**
 * Create a mock .grove.json config file
 */
export function createMockGroveConfig(vol: Volume, repoPath: string, config: unknown): void {
	const configPath = path.join(repoPath, '.grove.json');
	vol.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
