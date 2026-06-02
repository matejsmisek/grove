import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskService } from '../TaskService.js';

/** Wait for the next macrotask so queued promise bodies/timers can run */
function flushAsync(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TaskService', () => {
	// Use synchronous flushing (no throttle) by default for deterministic assertions.
	let service: TaskService;

	beforeEach(() => {
		service = new TaskService({ flushIntervalMs: 0 });
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	describe('run', () => {
		it('should return a handle with an id immediately', () => {
			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => 'done',
			});

			expect(handle.id).toBeTruthy();
			expect(service.get(handle.id)).toBeDefined();
		});

		it('should generate unique ids for concurrent tasks', () => {
			const a = service.run({ type: 't', title: 'a', execute: async () => undefined });
			const b = service.run({ type: 't', title: 'b', execute: async () => undefined });

			expect(a.id).not.toBe(b.id);
		});

		it('should transition to succeeded and store the result', async () => {
			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => 42,
			});

			const result = await handle.promise;

			expect(result).toBe(42);
			const task = service.get(handle.id);
			expect(task?.status).toBe('succeeded');
			expect(task?.result).toBe(42);
			expect(task?.startedAt).toBeTypeOf('number');
			expect(task?.finishedAt).toBeTypeOf('number');
		});

		it('should transition to failed and capture the error message', async () => {
			const handle = service.run({
				type: 'boom',
				title: 'Boom',
				execute: async () => {
					throw new Error('kaboom');
				},
			});

			await expect(handle.promise).rejects.toThrow('kaboom');

			const task = service.get(handle.id);
			expect(task?.status).toBe('failed');
			expect(task?.error?.message).toBe('kaboom');
		});

		it('should not raise an unhandled rejection when the promise is ignored', async () => {
			// Caller ignores the returned promise entirely.
			service.run({
				type: 'boom',
				title: 'Boom',
				execute: async () => {
					throw new Error('ignored');
				},
			});

			await flushAsync();
			// Reaching here without an unhandled rejection crashing the run is the assertion.
			expect(true).toBe(true);
		});

		it('should expose meta on the task snapshot', () => {
			const handle = service.run({
				type: 'createGrove',
				title: 'Create grove',
				meta: { groveName: 'feature-x' },
				execute: async () => undefined,
			});

			expect(service.get(handle.id)?.meta).toEqual({ groveName: 'feature-x' });
		});
	});

	describe('logging', () => {
		it('should append log lines emitted from the task body', async () => {
			const handle = service.run({
				type: 'logger',
				title: 'Logger',
				execute: async (ctx) => {
					ctx.log('first');
					ctx.log('second', 'stderr');
				},
			});

			await handle.promise;

			const task = service.get(handle.id);
			expect(task?.log).toHaveLength(2);
			expect(task?.log[0]).toMatchObject({ text: 'first', stream: 'info' });
			expect(task?.log[1]).toMatchObject({ text: 'second', stream: 'stderr' });
		});
	});

	describe('cancellation', () => {
		it('should abort the task signal and mark it cancelled', async () => {
			let observedAbort = false;

			const handle = service.run({
				type: 'cancellable',
				title: 'Cancellable',
				execute: async (ctx) => {
					await new Promise<void>((resolve) => {
						ctx.signal.addEventListener('abort', () => {
							observedAbort = true;
							resolve();
						});
					});
				},
			});

			await flushAsync(); // let the body start and subscribe to abort
			service.cancel(handle.id);
			await handle.promise;

			expect(observedAbort).toBe(true);
			expect(service.get(handle.id)?.status).toBe('cancelled');
		});

		it('should be a no-op for unknown task ids', () => {
			expect(() => service.cancel('does-not-exist')).not.toThrow();
		});
	});

	describe('get / list', () => {
		it('should return undefined for an unknown id', () => {
			expect(service.get('nope')).toBeUndefined();
		});

		it('should return a referentially stable snapshot when unchanged', () => {
			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => undefined,
			});

			const first = service.get(handle.id);
			const second = service.get(handle.id);
			expect(first).toBe(second);
		});

		it('should return a new snapshot reference after a change', async () => {
			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => undefined,
			});

			// The body runs synchronously up to its first await, so the task is
			// already 'running' by the time run() returns.
			const before = service.get(handle.id);
			await handle.promise; // status changes to succeeded
			const after = service.get(handle.id);

			expect(after).not.toBe(before);
			expect(before?.status).toBe('running');
			expect(after?.status).toBe('succeeded');
		});

		it('should list tasks newest first', async () => {
			const a = service.run({ type: 'a', title: 'a', execute: async () => undefined });
			const b = service.run({ type: 'b', title: 'b', execute: async () => undefined });
			await Promise.all([a.promise, b.promise]);

			const ids = service.list().map((t) => t.id);
			expect(ids).toEqual([b.id, a.id]);
		});

		it('should filter by status and type', async () => {
			const ok = service.run({ type: 'ok', title: 'ok', execute: async () => undefined });
			const bad = service.run({
				type: 'bad',
				title: 'bad',
				execute: async () => {
					throw new Error('x');
				},
			});

			await ok.promise;
			await bad.promise.catch(() => {});

			expect(service.list({ status: 'succeeded' }).map((t) => t.id)).toEqual([ok.id]);
			expect(service.list({ type: 'bad' }).map((t) => t.id)).toEqual([bad.id]);
		});
	});

	describe('getVersion', () => {
		it('should increase when tasks change', async () => {
			const before = service.getVersion();

			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => undefined,
			});
			expect(service.getVersion()).toBeGreaterThan(before);

			const afterRun = service.getVersion();
			await handle.promise;
			expect(service.getVersion()).toBeGreaterThan(afterRun);
		});
	});

	describe('subscriptions', () => {
		it('should notify task subscribers on change', async () => {
			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => undefined,
			});

			const listener = vi.fn();
			const unsubscribe = service.subscribeTask(handle.id, listener);

			await handle.promise;
			expect(listener).toHaveBeenCalled();

			listener.mockClear();
			unsubscribe();
			service.remove(handle.id);
			expect(listener).not.toHaveBeenCalled();
		});

		it('should notify global subscribers when a task is added', () => {
			const listener = vi.fn();
			service.subscribe(listener);

			service.run({ type: 'noop', title: 'Noop', execute: async () => undefined });

			expect(listener).toHaveBeenCalled();
		});
	});

	describe('remove', () => {
		it('should remove a finished task', async () => {
			const handle = service.run({
				type: 'noop',
				title: 'Noop',
				execute: async () => undefined,
			});
			await handle.promise;

			service.remove(handle.id);
			expect(service.get(handle.id)).toBeUndefined();
		});

		it('should not remove a running task', async () => {
			let release: () => void = () => {};
			const handle = service.run({
				type: 'long',
				title: 'Long',
				execute: async () => {
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				},
			});

			await flushAsync(); // let it reach running
			service.remove(handle.id);
			expect(service.get(handle.id)?.status).toBe('running');

			release();
			await handle.promise;
		});
	});

	describe('throttling', () => {
		it('should coalesce log notifications within the flush window', async () => {
			vi.useFakeTimers();
			const throttled = new TaskService({ flushIntervalMs: 80 });

			const listener = vi.fn();
			let logMany: () => void = () => {};
			const handle = throttled.run({
				type: 'spammer',
				title: 'Spammer',
				execute: async (ctx) => {
					logMany = () => {
						ctx.log('a');
						ctx.log('b');
						ctx.log('c');
					};
					await new Promise<void>((resolve) => {
						ctx.signal.addEventListener('abort', () => resolve());
					});
				},
			});

			// Let the body start (status->running flushes immediately).
			await vi.advanceTimersByTimeAsync(0);
			throttled.subscribeTask(handle.id, listener);

			logMany();
			// Three log lines, but no flush has fired yet -> no notification.
			expect(listener).not.toHaveBeenCalled();
			// Data is still readable immediately via get().
			expect(throttled.get(handle.id)?.log).toHaveLength(3);

			// Advance past the flush window -> exactly one coalesced notification.
			await vi.advanceTimersByTimeAsync(80);
			expect(listener).toHaveBeenCalledTimes(1);

			throttled.cancel(handle.id);
			await vi.advanceTimersByTimeAsync(0);
		});
	});
});
