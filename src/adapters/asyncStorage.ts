import type { QueueStorage } from "@/createQueue";

export function createAsyncStorageAdapter(asyncStorage: {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
}): QueueStorage {
	return {
		getItem: async <T>(key: string): Promise<T | null> => {
			const item = await asyncStorage.getItem(key);
			return item ? JSON.parse(item) : null;
		},
		setItem: async <T>(key: string, value: T): Promise<void> => {
			await asyncStorage.setItem(key, JSON.stringify(value));
		},
		removeItem: async (key: string): Promise<void> => {
			await asyncStorage.removeItem(key);
		},
	};
}
