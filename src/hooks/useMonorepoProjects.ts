import { useEffect, useState } from 'react';

import type { Repository } from '../storage/index.js';

/**
 * Load the project folders for every monorepo in `repositories` asynchronously,
 * keyed by repository path. Reads are kept off the render thread (they touch the
 * filesystem). `loadProjects` selects the detection strategy — callers pass the
 * same function they used before extraction so behavior is preserved.
 */
export function useMonorepoProjects(
	repositories: Repository[],
	loadProjects: (repoPath: string) => Promise<string[]>
): { projectsByRepo: Map<string, string[]>; projectsLoading: boolean } {
	const [projectsByRepo, setProjectsByRepo] = useState<Map<string, string[]>>(new Map());
	const [projectsLoading, setProjectsLoading] = useState(false);

	useEffect(() => {
		const monorepos = repositories.filter((repo) => repo.isMonorepo);
		if (monorepos.length === 0) {
			return;
		}

		let cancelled = false;
		setProjectsLoading(true);

		Promise.all(monorepos.map(async (repo) => [repo.path, await loadProjects(repo.path)] as const))
			.then((entries) => {
				if (cancelled) return;
				setProjectsByRepo(new Map(entries));
				setProjectsLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setProjectsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [repositories, loadProjects]);

	return { projectsByRepo, projectsLoading };
}
