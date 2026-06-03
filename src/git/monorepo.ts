import fs from 'fs';
import path from 'path';

/**
 * Directories that are never themselves project folders and should be skipped
 * when scanning a repository's structure.
 */
const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.github',
	'.vscode',
	'.idea',
	'.grove',
	'node_modules',
	'dist',
	'build',
	'out',
	'coverage',
	'.cache',
	'.turbo',
	'.next',
	'.nuxt',
	'__pycache__',
	'.pytest_cache',
	'vendor',
	'target',
]);

/**
 * Directory names that commonly *contain* multiple sub-projects in a monorepo
 * (e.g. packages/foo, apps/web). We descend one level into these to find the
 * actual projects.
 */
const CONTAINER_DIRECTORIES = new Set([
	'packages',
	'apps',
	'services',
	'libs',
	'lib',
	'modules',
	'projects',
	'crates',
	'components',
	'plugins',
	'workspaces',
]);

/**
 * Files that mark a directory as a buildable project/package. Presence of any
 * of these (or a `src` directory / source files) makes a folder "look like" a
 * project.
 */
const PROJECT_MARKER_FILES = new Set([
	'package.json',
	'composer.json',
	'pyproject.toml',
	'setup.py',
	'setup.cfg',
	'go.mod',
	'cargo.toml',
	'pom.xml',
	'build.gradle',
	'build.gradle.kts',
	'build.sbt',
	'gemfile',
	'pubspec.yaml',
	'requirements.txt',
]);

/** File extensions that, on their own, indicate a project folder. */
const PROJECT_MARKER_EXTENSIONS = ['.csproj', '.sln', '.fsproj'];

/**
 * Decide whether a directory looks like a self-contained project/package based
 * on its immediate entries: a known manifest file, a `src` directory, or a
 * project file extension (incl. a Python source file).
 */
function entriesLookLikeProject(entries: fs.Dirent[]): boolean {
	for (const entry of entries) {
		const lower = entry.name.toLowerCase();

		if (entry.isFile()) {
			if (PROJECT_MARKER_FILES.has(lower)) {
				return true;
			}
			if (lower.endsWith('.py')) {
				return true;
			}
			if (PROJECT_MARKER_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
				return true;
			}
		} else if (entry.isDirectory() && lower === 'src') {
			return true;
		}
	}
	return false;
}

/** Read directory entries, returning an empty list on any error. */
function readDirSafe(dirPath: string): fs.Dirent[] {
	try {
		return fs.readdirSync(dirPath, { withFileTypes: true });
	} catch {
		return [];
	}
}

function isScannableDir(entry: fs.Dirent): boolean {
	if (!entry.isDirectory()) {
		return false;
	}
	if (IGNORED_DIRECTORIES.has(entry.name)) {
		return false;
	}
	// Skip hidden directories (not in the ignored set, e.g. .husky)
	if (entry.name.startsWith('.')) {
		return false;
	}
	return true;
}

/**
 * Enumerate the project folders within a repository, returning paths relative
 * to the repository root.
 *
 * Detection strategy:
 * - A top-level directory that itself looks like a project is included by name
 *   (e.g. "frontend").
 * - A top-level directory that is a known container (packages, apps, …) is
 *   descended one level, and each child that looks like a project is included
 *   as "container/child" (e.g. "packages/core").
 *
 * The result is sorted and de-duplicated. Reads are synchronous but bounded to
 * two directory levels; callers that must not block should invoke this off the
 * render path (e.g. inside an effect/Promise), mirroring getMonorepoProjects.
 */
export function getRepoProjectsSync(repoPath: string): string[] {
	const projects = new Set<string>();
	const topEntries = readDirSafe(repoPath).filter(isScannableDir);

	for (const dir of topEntries) {
		const dirPath = path.join(repoPath, dir.name);
		const dirEntries = readDirSafe(dirPath);

		if (entriesLookLikeProject(dirEntries)) {
			projects.add(dir.name);
			continue;
		}

		if (CONTAINER_DIRECTORIES.has(dir.name)) {
			for (const child of dirEntries.filter(isScannableDir)) {
				const childEntries = readDirSafe(path.join(dirPath, child.name));
				if (entriesLookLikeProject(childEntries)) {
					projects.add(`${dir.name}/${child.name}`);
				}
			}
		}
	}

	return Array.from(projects).sort();
}

/**
 * Async wrapper around getRepoProjectsSync, for use where an awaitable API is
 * preferred (keeps call sites consistent with getMonorepoProjects).
 */
export async function getRepoProjects(repoPath: string): Promise<string[]> {
	return getRepoProjectsSync(repoPath);
}

/**
 * Auto-detect whether a repository is a monorepo based on its folder structure.
 * A repository is considered a monorepo when it contains two or more distinct
 * project folders (top-level projects and/or projects nested under container
 * directories). A single project at the repository root is NOT a monorepo.
 */
export function detectMonorepoSync(repoPath: string): boolean {
	return getRepoProjectsSync(repoPath).length >= 2;
}

/** Async wrapper around detectMonorepoSync. */
export async function detectMonorepo(repoPath: string): Promise<boolean> {
	return detectMonorepoSync(repoPath);
}
