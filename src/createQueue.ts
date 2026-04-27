/**
 * Storage adapter interface for queue persistence.
 * Implement this to use any storage backend (localStorage, IndexedDB, custom backend, etc.)
 */
export interface QueueStorage {
	getItem: <T>(key: string) => Promise<T | null>;
	setItem: <T>(key: string, value: T) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
}

/**
 * Options for processing the queue.
 * @property key - Filter tasks by their key array (similar to TanStack Query query keys).
 *                  Only tasks whose key array shares at least one entry with this array will be processed.
 */
export interface ProcessQueueOptions {
	key?: string[];
}

/**
 * A task stored in the queue.
 * @property id - Unique identifier combining timestamp and random string.
 * @property handler - Name of the registered handler function to call.
 * @property params - Arguments to pass to the handler function.
 * @property addedAt - Unix timestamp (ms) when the task was added.
 * @property key - Array of string keys for filtering tasks. Any task whose key array contains
 *                 a value from the filter will be included (similar to TanStack Query query key matching).
 * @property retries - Number of times to retry on failure. Use Infinity for unlimited retries.
 *                     Tasks with retries remaining will be re-queued after failure.
 * @property background - If true (default), the handler is called without waiting
 *                        If false, the handler is awaited before moving to the next task.
 */
export interface QueuedTask {
	id: string;
	handler: string;
	params: unknown[];
	addedAt: number;
	key?: string[];
	retries?: number;
	background?: boolean;
}

/**
 * Options for creating a queue instance.
 * @property storage - QueueStorage adapter for persisting the queue.
 * @property handlers - Map of handler function names to their implementations.
 * @property storageKey - Key used in storage (default: "@laterQueue").
 * @property debounceMs - Debounce delay for saving to storage (default: 200ms).
 *                        Prevents excessive writes during rapid add() calls.
 */
export interface CreateQueueOptions<
	THandlers extends Record<string, (...args: any[]) => Promise<unknown>>,
> {
	storage: QueueStorage;
	handlers: THandlers;
	storageKey?: string;
	debounceMs?: number;
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

type HandlerParams<
	THandlers extends Record<string, (...args: any[]) => Promise<unknown>>,
	H extends keyof THandlers,
> = Parameters<THandlers[H]>;

export interface Queue<
	THandlers extends Record<string, (...args: any[]) => Promise<unknown>>,
> {
	add: <H extends keyof THandlers & string>(
		props: AddTaskOptions<THandlers, H>,
	) => Promise<void>;
	process: (options?: ProcessQueueOptions) => Promise<void>;
	cancel: (keys: string[]) => Promise<void>;
	clear: () => Promise<void>;
	getAll: () => Promise<QueuedTask[]>;
}

/**
 * Options for adding a task to the queue.
 * @property handler - Name of a registered handler to execute.
 * @property params - Arguments to pass to the handler function.
 * @property key - Array of keys for filtering/categorizing this task.
 *                 Use to match tasks when calling process({ key: [...] }).
 * @property retries - Number of retry attempts on failure. Infinity (or -1 internally)
 *                      means unlimited retries; the task is never removed automatically.
 *                      Default: undefined (no retries).
 * @property background - If true (default), processing continues immediately without waiting.
 *                        If false, the handler is awaited before processing the next task.
 */
export interface AddTaskOptions<
	THandlers extends Record<string, (...args: any[]) => Promise<unknown>>,
	H extends keyof THandlers & string,
> {
	handler: H;
	params: HandlerParams<THandlers, H>;
	key?: string[];
	retries?: number;
	background?: boolean;
}

const INFINITE_RETRIES = -1;

/**
 * Creates a persistent task queue with handler registration and filtering support.
 *
 * @example
 * ```ts
 * const queue = createQueue({
 *   storage: localStorageAdapter,
 *   handlers: {
 *     sendEmail: async (to: string, subject: string) => { ... },
 *     syncData: async () => { ... }
 *   },
 *   debounceMs: 300
 * });
 *
 * // Add a task
 * await queue.add({ handler: 'sendEmail', params: ['user@example.com', 'Hello'] });
 *
 * // Process with key filtering (like TanStack Query query keys)
 * await queue.process({ key: ['notifications', 'email'] });
 * ```
 */
export function createQueue<
	THandlers extends Record<string, (...args: any[]) => Promise<unknown>>,
>({
	storage,
	handlers,
	storageKey = "@laterQueue",
	debounceMs = 200,
}: CreateQueueOptions<THandlers>): Queue<THandlers> {
	/** Debounce timer for batched saves */
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	/** Prevents concurrent process() calls */
	let isProcessing = false;

	/**
	 * Persists the queue to storage.
	 * @param queue - The queue array to save.
	 * @param immediate - If true, saves immediately (bypasses debounce). Used after task completion or failure.
	 */
	async function saveQueue({
		queue,
		immediate = false,
	}: {
		queue: QueuedTask[];
		immediate?: boolean;
	}): Promise<void> {
		if (immediate) {
			await storage.setItem(storageKey, queue);
			return;
		}

		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await storage.setItem(storageKey, queue);
		}, debounceMs);
	}

	/** Retrieves the current queue from storage */
	async function getQueue(): Promise<QueuedTask[]> {
		return (await storage.getItem<QueuedTask[]>(storageKey)) ?? [];
	}

	/**
	 * Adds a new task to the queue.
	 * @param props.handler - Name of a registered handler function.
	 * @param props.params - Arguments forwarded to the handler when executed.
	 * @param props.key - Optional keys for filtering (like TanStack Query query keys).
	 * @param props.retries - Retry count on failure. Infinity for unlimited retries.
	 * @param props.background - If true (default), non-blocking; if false, awaits completion.
	 */
	async function add<H extends keyof THandlers & string>({
		handler,
		params,
		key,
		retries,
		background,
	}: AddTaskOptions<THandlers, H>): Promise<void> {
		try {
			if (!handlers[handler]) {
				throw new Error(`Handler "${handler}" is not registered.`);
			}
			const queue = await getQueue();
			const now = Date.now();

			const newTask: QueuedTask = {
				id: `${now}-${Math.random().toString(36).substring(2, 9)}`,
				handler,
				addedAt: now,
				params,
				key,
				retries: retries === Infinity ? INFINITE_RETRIES : retries,
				background: background,
			};
			queue.push(newTask);
			await saveQueue({ queue });
		} catch (error) {
			console.error("Error adding to queue:", error);
		}
	}

	/**
	 * Starts processing the queue.
	 * Only one process() call runs at a time (guarded by isProcessing).
	 * @param options.key - Optional filter keys. Only tasks whose key overlaps with this array are processed.
	 */
	async function process(options?: ProcessQueueOptions): Promise<void> {
		if (isProcessing) return;
		isProcessing = true;
		try {
			await processInner(options);
		} finally {
			isProcessing = false;
		}
	}

	/**
	 * Recursively processes tasks in the queue.
	 *
	 * Processing behavior:
	 * - `background: true` (default) - Handler is called without await; next task starts immediately.
	 * - `background: false` - Handler is awaited before proceeding to the next task.
	 *
	 * On error:
	 * - If retries remain, the task is re-queued with decremented retry count.
	 * - If retries === INFINITE_RETRIES (-1), the task stays in queue (can be retried externally).
	 * - Otherwise, the task is permanently removed.
	 *
	 * @param options - ProcessQueueOptions with optional key filtering.
	 * @param remaining - Pass remaining queue between recursions to avoid re-reading storage.
	 */
	async function processInner(
		options?: ProcessQueueOptions,
		remaining?: QueuedTask[],
	): Promise<void> {
		try {
			const queue = remaining ?? (await getQueue());
			if (queue.length === 0) return;

			const filtered = options?.key
				? queue.filter((task) =>
						options.key?.some((k) => task?.key?.includes(k)),
					)
				: queue;

			if (filtered.length === 0) return;

			const taskToProcess = filtered[0];
			if (!taskToProcess) return;

			const handlerFn = handlers[taskToProcess.handler];

			try {
				if (!handlerFn) {
					throw new Error(
						`No handler registered for "${taskToProcess.handler}"`,
					);
				}

				// Execute task function (synchronously or asynchronously)
				if (taskToProcess.background === false) {
					await handlerFn(...taskToProcess.params);
				} else {
					handlerFn(...taskToProcess.params).catch((error) => {
						console.error(
							`Background task "${taskToProcess.handler}" failed:`,
							error,
						);
					});
				}

				const updatedQueue = queue.filter((t) => t.id !== taskToProcess.id);
				await saveQueue({ queue: updatedQueue, immediate: true });

				await processInner(options, updatedQueue);
			} catch (error) {
				console.error(
					`Error processing task "${taskToProcess.handler}" (${taskToProcess.id}):`,
					error,
				);

				const updatedQueueCatch = queue.filter(
					(t) => t.id !== taskToProcess.id,
				);

				if (taskToProcess?.retries && taskToProcess?.retries > 0) {
					updatedQueueCatch.push({
						...taskToProcess,
						retries: taskToProcess.retries - 1,
					});
				}

				// Remove the failed task from the queue and save (Infinity doesnt get removed until its done)
				if (taskToProcess.retries === INFINITE_RETRIES) {
					updatedQueueCatch.push({ ...taskToProcess });
				}

				await saveQueue({ queue: updatedQueueCatch, immediate: true });

				// Process the rest of the tasks
				await processInner(options, updatedQueueCatch);
			}
		} catch (error) {
			// This catch usually happens to unexpected errors or storage implementation issues
			console.error("Error processing queue:", error);
		}
	}

	/**
	 * Cancels and removes tasks that match any of the given keys.
	 * @param keys - Array of keys. Any task whose key array contains one of these is removed.
	 */
	async function cancel(keys: string[]): Promise<void> {
		try {
			const queue = await getQueue();
			const updated = queue.filter(
				(task) => !keys.some((k) => task?.key?.includes(k)),
			);
			await saveQueue({ queue: updated, immediate: true });
		} catch (error) {
			console.error("Error cancelling tasks:", error);
		}
	}

	/**
	 * Clears all tasks from the queue.
	 */
	async function clear(): Promise<void> {
		try {
			await storage.removeItem(storageKey);
		} catch (error) {
			console.error("Error clearing queue:", error);
		}
	}

	return { add, process, cancel, clear, getAll: getQueue };
}
