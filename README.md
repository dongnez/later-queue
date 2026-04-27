# later-queue

A lightweight, offline-first task queue for JavaScript and TypeScript.

Queue async tasks now, run them later. When the connection drops, tasks persist in storage and replay automatically when you're back online. Works in plain JS, React, React Native, or any environment with async storage. No framework dependencies, no Redux, no bloat.

---

## Install

```bash
npm install later-queue
# or
bun add later-queue
```

---

## Quick Start

```ts
import { createQueue, localStorageAdapter } from "later-queue";

const queue = createQueue({
  storage: localStorageAdapter,
  handlers: {
    sendMessage: async (text: string) => {
      await api.sendMessage(text);
    },
    syncSettings: async (settings: Settings) => {
      await api.syncSettings(settings);
    },
  },
});

// Add a task
await queue.add({
  handler: "sendMessage",
  params: ["Hello!"],
});

// Process the queue (e.g. on reconnect)
window.addEventListener("online", () => queue.process());
```

Tasks are persisted to storage immediately. If the app closes before `process()` runs, they'll still be there next time.

---

## Type-safe API handlers

Spread your existing API modules as handlers — handler names and params are both autocompleted:

```ts
import { createQueue, localStorageAdapter } from "later-queue";
import { usersApi } from "@/api/users";
import { todosApi } from "@/api/todos";

export const offlineQueue = createQueue({
  storage: localStorageAdapter,
  handlers: {
    ...usersApi,
    ...todosApi,
  },
});
```

```ts
// ✅ handler name autocompletes to all keys of usersApi + todosApi
// ✅ params are typed based on the exact function signature
await offlineQueue.add({
  handler: "updateUserApi",
  params: [user],
});
```

---

## React Native

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createQueue, createAsyncStorageAdapter } from "later-queue";

const asyncStorageAdapter = createAsyncStorageAdapter(AsyncStorage);

const queue = createQueue({
  storage: asyncStorageAdapter,
  handlers: { ...usersApi, ...todosApi },
});
```

Connect to network events:

```ts
import NetInfo from "@react-native-community/netinfo";

NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    queue.process();
  }
});
```

---

## Keys

Keys let you filter which tasks to process — similar to TanStack Query's query keys.

```ts
// Tag tasks when adding
await queue.add({
  handler: "updateUserApi",
  params: [user],
  key: ["user", "offline"],
});

await queue.add({
  handler: "syncSettings",
  params: [settings],
  key: ["settings"],
});
```

```ts
// Only process user tasks
await queue.process({ key: ["user"] });

// Only process offline-tagged tasks
await queue.process({ key: ["offline"] });

// Process everything
await queue.process();
```

Cancel tasks by key:

```ts
await queue.cancel(["user"]);
```

---

## Retries

By default, a task that fails is removed from the queue. Add retries to keep trying:

```ts
await queue.add({
  handler: "updateUserApi",
  params: [user],
  retries: 3,       // retry up to 3 times on failure
});

await queue.add({
  handler: "criticalSync",
  params: [data],
  retries: Infinity, // never give up — task stays in queue until it succeeds
});
```

Failed tasks with remaining retries are moved to the end of the queue so they don't block other tasks.

---

## Background tasks

Tasks run in the background by default — the queue moves on without waiting for them to finish. Set `background: false` to block until the task completes before processing the next one.

```ts
await queue.add({
  handler: "criticalTask",
  params: [data],
  background: false, // wait for this one before moving on
});
```

> **Note:** Since tasks are processed sequentially, a `background: false` task will hold up the entire queue until it resolves. Use it only when the next tasks depend on the result of this one.

---

## Storage Adapters

Built-in adapters included:

- **`localStorageAdapter`** — for web (uses `localStorage` under the hood)
- **`createAsyncStorageAdapter(storage)`** — wraps any AsyncStorage-compatible storage (React Native, etc.)

```ts
import { localStorageAdapter, createAsyncStorageAdapter } from "later-queue";

// Web
const queue = createQueue({ storage: localStorageAdapter, ... });

// React Native
import AsyncStorage from "@react-native-async-storage/async-storage";
const asyncStorageAdapter = createAsyncStorageAdapter(AsyncStorage);
const queue = createQueue({ storage: asyncStorageAdapter, ... });
```

Need a custom adapter? Implement the `QueueStorage` interface:

```ts
interface QueueStorage {
  getItem: <T>(key: string) => Promise<T | null>;
  setItem: <T>(key: string, value: T) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}
```

Works with `IndexedDB`, `MMKV`, or any custom backend.

---

## API

### `createQueue(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `storage` | `QueueStorage` | required | Storage adapter for persisting the queue |
| `handlers` | `Record<string, fn>` | required | Map of handler functions |
| `storageKey` | `string` | `"@laterQueue"` | Key used in storage |
| `debounceMs` | `number` | `200` | Debounce delay for batched saves |

### `queue.add(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `handler` | `string` | required | Handler name (must match a registered handler) |
| `params` | `array` | required | Arguments passed to handler |
| `key` | `string[]` | `undefined` | Keys for filtering (like TanStack Query) |
| `retries` | `number \| Infinity` | `undefined` | Retry attempts on failure |
| `background` | `boolean` | `undefined` (behaves as `true`) | `true` = fire and forget, `false` = block queue |

### Other methods

```ts
queue.process(options?)   // process the queue, optional key filter
queue.cancel(keys)        // remove tasks matching keys
queue.clear()             // remove all tasks
queue.getAll()            // return all queued tasks
```

---

## License

MIT