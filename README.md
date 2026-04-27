# later-queue

Lightweight client-side task queue with offline-first support — persist, retry and replay async tasks.

Queue a task now, run it later. When the connection drops, tasks stay in storage and get replayed automatically when you're back online.

---

## Why

Most apps silently fail when the user goes offline. `later-queue` gives you a simple way to queue any async task — API calls, syncs, analytics — and process them when ready.

No Redux. No heavy dependencies. Works in React, React Native, or anywhere with async storage.

---

## Install

```bash
npm install later-queue
# or
bun add later-queue
```

---

## Quick Start

The simplest possible setup — register your handlers, add tasks, process when ready.

```ts
import { createQueue } from "later-queue";

const queue = createQueue({
  storage: localStorage, // any storage that implements get/set/remove
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
await queue.process();
```

Tasks are persisted to storage immediately. If the app closes before `process()` runs, they'll still be there next time.

---

## With an API module

A common pattern is to spread your existing API object directly as handlers. No wrapper needed.

```ts
import { createQueue } from "later-queue";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { streaksApi } from "@/api/streaks";
import { exercisesApi } from "@/api/exercises";
import { isWifiConnected } from "@/utils/network";

export const offlineQueue = createQueue({
  storage: AsyncStorage,
  storageKey: "@offlineQueue",
  shouldProcess: isWifiConnected,
  handlers: {
    ...streaksApi,
    ...exercisesApi,
  },
});
```

Then add tasks anywhere in your app with full type safety — handler names and params are both autocompleted:

```ts
// ✅ handler name autocompletes to all keys of streaksApi + exercisesApi
// ✅ params are typed based on the exact function signature
await offlineQueue.add({
  handler: "updateStreakApi",
  params: [streak],
});

await offlineQueue.add({
  handler: "filterStreaksByMonthApi",
  params: [2026, 4],
});
```

Call `process()` when the connection is restored:

```ts
import NetInfo from "@react-native-community/netinfo";

NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    offlineQueue.process();
  }
});
```

---

## Keys

Keys let you filter which tasks to process — similar to TanStack Query's query keys.

```ts
// Tag tasks when adding
await offlineQueue.add({
  handler: "updateStreakApi",
  params: [streak],
  key: ["streak", "offline"],
});

await offlineQueue.add({
  handler: "syncSettings",
  params: [settings],
  key: ["settings"],
});
```

```ts
// Only process streak tasks
await offlineQueue.process({ key: ["streak"] });

// Only process offline-tagged tasks
await offlineQueue.process({ key: ["offline"] });

// Process everything
await offlineQueue.process();
```

Cancel tasks by key:

```ts
await offlineQueue.cancel(["streak"]);
```

---

## Retries

By default, a task that fails is removed from the queue. You can change that:

```ts
await offlineQueue.add({
  handler: "updateStreakApi",
  params: [streak],
  retries: 3,       // retry up to 3 times on failure
});

await offlineQueue.add({
  handler: "criticalSync",
  params: [data],
  retries: Infinity, // never give up
});
```

Failed tasks with remaining retries are moved to the end of the queue so they don't block other tasks.

---

## Background tasks

By default tasks run in the background — the queue moves on without waiting for them to finish. Set `background: false` to block until the task completes before processing the next one.

```ts
await offlineQueue.add({
  handler: "criticalTask",
  params: [data],
  background: false, // wait for this one before moving on
});
```

---

## API

### `createQueue(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `storage` | `QueueStorage` | required | Storage adapter |
| `handlers` | `Record<string, fn>` | required | Map of handler functions |
| `storageKey` | `string` | `"@laterQueue"` | Key used in storage |
| `debounceMs` | `number` | `200` | Debounce delay for saves |
| `shouldProcess` | `() => Promise<boolean>` | `async () => true` | Connectivity check |

### `queue.add(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `handler` | `string` | required | Handler name |
| `params` | `array` | required | Arguments passed to handler |
| `key` | `string[]` | `[]` | Keys for filtering |
| `retries` | `number \| Infinity` | `0` | Retry attempts on failure |
| `background` | `boolean` | `true` | Fire and forget vs blocking |

### Other methods

```ts
queue.process(options?)   // process the queue, optional key filter
queue.cancel(keys)        // remove tasks matching keys
queue.clear()             // remove all tasks
queue.getAll()            // return all queued tasks
```

---

## Custom storage adapter

Any object that implements this interface works:

```ts
interface QueueStorage {
  getItem: <T>(key: string) => Promise<T | null>;
  setItem: <T>(key: string, value: T) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}
```

Works with `AsyncStorage`, `localStorage`, `IndexedDB`, `MMKV`, or anything custom.

---

## License

MIT
