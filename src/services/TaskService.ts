/**
 * TaskService - In-process background job manager
 *
 * Owns long-running operations (grove creation, init actions, worktree
 * operations) as tracked "tasks" that live independently of any React screen.
 * A screen can start a task and immediately navigate away; the task keeps
 * running and its progress can be observed from anywhere via subscriptions.
 *
 * Design notes:
 * - Tasks run on the same event loop as the Ink UI. This service provides
 *   decoupling and survivability across navigation; it does NOT make blocking
 *   IO non-blocking. The work executed inside a task must itself be async.
 * - Snapshots returned by `get()`/`list()` are referentially stable until the
 *   task actually changes, so they are safe to use with `useSyncExternalStore`.
 * - Log appends are coalesced and flushed on a throttle interval to avoid
 *   re-render storms when a task emits many lines (e.g. init action output).
 *   Status transitions flush immediately so the UI sees terminal state at once.
 */

/** Lifecycle status of a task */
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** Origin stream of a single log line */
export type TaskLogStream = 'stdout' | 'stderr' | 'info';

/** A single line of task output */
export interface TaskLogLine {
	/** Epoch milliseconds when the line was recorded */
	ts: number;
	text: string;
	stream: TaskLogStream;
}

/** Immutable snapshot of a task's state */
export interface Task<TResult = unknown> {
	id: string;
	/** Machine-readable kind, e.g. 'createGrove' | 'addWorktree' */
	type: string;
	/** Human-readable label for the activity view */
	title: string;
	status: TaskStatus;
	log: TaskLogLine[];
	result?: TResult;
	error?: { message: string };
	/** Arbitrary task metadata, e.g. { groveId, groveName } */
	meta: Record<string, unknown>;
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
}

/** Execution context passed to a task body */
export interface TaskContext {
	/** Append a line of output to the task log */
	log: (text: string, stream?: TaskLogStream) => void;
	/** Abort signal that flips when the task is cancelled */
	signal: AbortSignal;
	/** Convenience accessor for `signal.aborted` */
	isCancelled: () => boolean;
}

/** Definition of a task to run */
export interface TaskDefinition<TResult> {
	type: string;
	title: string;
	meta?: Record<string, unknown>;
	execute: (ctx: TaskContext) => Promise<TResult>;
}

/** Handle returned when a task is started */
export interface TaskHandle<TResult> {
	id: string;
	/**
	 * Resolves/rejects with the task body's result. Always has an internal
	 * no-op catch attached so ignoring it never produces an unhandled rejection.
	 */
	promise: Promise<TResult>;
}

/** Filter for listing tasks */
export interface TaskFilter {
	status?: TaskStatus;
	type?: string;
}

/** Options for constructing a TaskService */
export interface TaskServiceOptions {
	/**
	 * Throttle window (ms) for coalescing log-driven notifications. Status
	 * transitions always flush immediately regardless of this value. A value
	 * of 0 flushes synchronously on every change (useful for tests).
	 */
	flushIntervalMs?: number;
}

/**
 * TaskService interface
 */
export interface ITaskService {
	/** Start a task. Returns immediately with a handle; the body runs async. */
	run<TResult>(def: TaskDefinition<TResult>): TaskHandle<TResult>;
	/** Get a stable snapshot of a single task, or undefined if unknown */
	get(id: string): Task | undefined;
	/** List task snapshots, optionally filtered, newest first */
	list(filter?: TaskFilter): Task[];
	/**
	 * Monotonically increasing version, bumped on any change. Use as the
	 * `getSnapshot` for `useSyncExternalStore` when observing the task list,
	 * since `list()` returns a fresh array on every call.
	 */
	getVersion(): number;
	/** Request cancellation of a running task (cooperative via AbortSignal) */
	cancel(id: string): void;
	/** Remove a finished task from the registry (no-op if still running) */
	remove(id: string): void;
	/** Subscribe to any change across all tasks (add/remove/update) */
	subscribe(listener: () => void): () => void;
	/** Subscribe to changes for a single task */
	subscribeTask(id: string, listener: () => void): () => void;
}

const DEFAULT_FLUSH_INTERVAL_MS = 80;

interface TaskRecord {
	/** Monotonic creation sequence, used for stable newest-first ordering */
	seq: number;
	/** Mutable working state */
	live: Task;
	/** Cached immutable snapshot, rebuilt lazily when `dirty` */
	snapshot: Task;
	dirty: boolean;
	controller: AbortController;
	flushTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * In-process background task manager. Registered as a singleton.
 */
export class TaskService implements ITaskService {
	private readonly records = new Map<string, TaskRecord>();
	private readonly taskListeners = new Map<string, Set<() => void>>();
	private readonly globalListeners = new Set<() => void>();
	private readonly flushIntervalMs: number;
	private counter = 0;
	private version = 0;

	constructor(options: TaskServiceOptions = {}) {
		this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
	}

	run<TResult>(def: TaskDefinition<TResult>): TaskHandle<TResult> {
		const seq = ++this.counter;
		const id = `task-${seq}`;
		const controller = new AbortController();
		const now = Date.now();

		const live: Task<TResult> = {
			id,
			type: def.type,
			title: def.title,
			status: 'pending',
			log: [],
			meta: { ...(def.meta ?? {}) },
			createdAt: now,
		};

		const record: TaskRecord = {
			seq,
			live: live as Task,
			snapshot: this.cloneTask(live),
			dirty: false,
			controller,
			flushTimer: null,
		};
		this.records.set(id, record);
		this.notifyGlobal();

		const ctx: TaskContext = {
			log: (text, stream = 'info') => this.appendLog(record, text, stream),
			signal: controller.signal,
			isCancelled: () => controller.signal.aborted,
		};

		const promise = (async (): Promise<TResult> => {
			live.status = 'running';
			live.startedAt = Date.now();
			this.touch(record, true);

			try {
				const result = await def.execute(ctx);
				if (controller.signal.aborted) {
					live.status = 'cancelled';
				} else {
					live.status = 'succeeded';
					live.result = result;
				}
				live.finishedAt = Date.now();
				this.touch(record, true);
				return result;
			} catch (error) {
				live.status = controller.signal.aborted ? 'cancelled' : 'failed';
				live.error = { message: error instanceof Error ? error.message : String(error) };
				live.finishedAt = Date.now();
				this.touch(record, true);
				throw error;
			}
		})();

		// Prevent an unhandled rejection if the caller ignores the promise.
		// The returned promise is still rejectable for callers that await it.
		promise.catch(() => {});

		return { id, promise };
	}

	get(id: string): Task | undefined {
		const record = this.records.get(id);
		if (!record) {
			return undefined;
		}
		return this.readSnapshot(record);
	}

	list(filter?: TaskFilter): Task[] {
		const matched: { seq: number; snap: Task }[] = [];
		for (const record of this.records.values()) {
			const snap = this.readSnapshot(record);
			if (filter?.status && snap.status !== filter.status) {
				continue;
			}
			if (filter?.type && snap.type !== filter.type) {
				continue;
			}
			matched.push({ seq: record.seq, snap });
		}
		// Newest first by monotonic creation sequence (stable even within the
		// same millisecond, where createdAt would tie).
		matched.sort((a, b) => b.seq - a.seq);
		return matched.map((m) => m.snap);
	}

	getVersion(): number {
		return this.version;
	}

	cancel(id: string): void {
		const record = this.records.get(id);
		if (!record) {
			return;
		}
		if (record.live.status !== 'running' && record.live.status !== 'pending') {
			return;
		}
		record.controller.abort();
	}

	remove(id: string): void {
		const record = this.records.get(id);
		if (!record) {
			return;
		}
		// Don't remove a task that is still in flight.
		if (record.live.status === 'running' || record.live.status === 'pending') {
			return;
		}
		if (record.flushTimer) {
			clearTimeout(record.flushTimer);
		}
		this.records.delete(id);
		this.notifyTask(id);
		this.taskListeners.delete(id);
		this.notifyGlobal();
	}

	subscribe(listener: () => void): () => void {
		this.globalListeners.add(listener);
		return () => {
			this.globalListeners.delete(listener);
		};
	}

	subscribeTask(id: string, listener: () => void): () => void {
		let listeners = this.taskListeners.get(id);
		if (!listeners) {
			listeners = new Set();
			this.taskListeners.set(id, listeners);
		}
		listeners.add(listener);
		return () => {
			const current = this.taskListeners.get(id);
			if (current) {
				current.delete(listener);
				if (current.size === 0) {
					this.taskListeners.delete(id);
				}
			}
		};
	}

	private appendLog(record: TaskRecord, text: string, stream: TaskLogStream): void {
		record.live.log.push({ ts: Date.now(), text, stream });
		this.touch(record, false);
	}

	/**
	 * Mark a record changed and notify subscribers. `immediate` notifications
	 * (status transitions) bypass the throttle; throttled ones (log appends)
	 * coalesce into a single notification per flush window.
	 */
	private touch(record: TaskRecord, immediate: boolean): void {
		record.dirty = true;

		if (immediate || this.flushIntervalMs <= 0) {
			if (record.flushTimer) {
				clearTimeout(record.flushTimer);
				record.flushTimer = null;
			}
			this.emit(record);
			return;
		}

		if (record.flushTimer) {
			return;
		}
		record.flushTimer = setTimeout(() => {
			record.flushTimer = null;
			this.emit(record);
		}, this.flushIntervalMs);
		// Don't let a pending flush keep the process alive on exit.
		if (typeof record.flushTimer.unref === 'function') {
			record.flushTimer.unref();
		}
	}

	private emit(record: TaskRecord): void {
		this.notifyTask(record.live.id);
		this.notifyGlobal();
	}

	private notifyTask(id: string): void {
		const listeners = this.taskListeners.get(id);
		if (!listeners) {
			return;
		}
		for (const listener of listeners) {
			listener();
		}
	}

	private notifyGlobal(): void {
		this.version++;
		for (const listener of this.globalListeners) {
			listener();
		}
	}

	/**
	 * Return the cached snapshot, rebuilding it only when the record is dirty.
	 * Keeps snapshot identity stable between changes so consumers relying on
	 * referential equality (useSyncExternalStore) don't loop.
	 */
	private readSnapshot(record: TaskRecord): Task {
		if (record.dirty) {
			record.snapshot = this.cloneTask(record.live);
			record.dirty = false;
		}
		return record.snapshot;
	}

	private cloneTask(task: Task): Task {
		return {
			...task,
			log: task.log.map((line) => ({ ...line })),
			meta: { ...task.meta },
			error: task.error ? { ...task.error } : undefined,
		};
	}
}
