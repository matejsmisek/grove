import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useService } from '../di/index.js';
import type { Task, TaskFilter } from '../services/TaskService.js';
import { TaskServiceToken } from '../services/tokens.js';

/**
 * Subscribe to a single background task by id. Returns a stable snapshot that
 * only changes when the task itself changes. Pass `null` to observe nothing.
 */
export function useTask(id: string | null): Task | undefined {
	const taskService = useService(TaskServiceToken);

	const subscribe = useCallback(
		(onChange: () => void) => (id ? taskService.subscribeTask(id, onChange) : () => {}),
		[taskService, id]
	);

	const getSnapshot = useCallback(() => (id ? taskService.get(id) : undefined), [taskService, id]);

	return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Subscribe to the list of background tasks, optionally filtered. Recomputes
 * only when the TaskService version changes (i.e. when any task changes).
 */
export function useTasks(filter?: TaskFilter): Task[] {
	const taskService = useService(TaskServiceToken);

	const subscribe = useCallback(
		(onChange: () => void) => taskService.subscribe(onChange),
		[taskService]
	);

	const version = useSyncExternalStore(subscribe, () => taskService.getVersion());

	const status = filter?.status;
	const type = filter?.type;

	return useMemo(
		() => taskService.list({ status, type }),
		// `version` intentionally drives recomputation since list() is not memoized.
		[taskService, version, status, type]
	);
}
