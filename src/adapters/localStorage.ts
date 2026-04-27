import type { QueueStorage } from "@/createQueue";

export const localStorageAdapter: QueueStorage = {
	getItem: async <T>(key: string): Promise<T | null> => {
		const item = localStorage.getItem(key);
		return item ? JSON.parse(item) : null;
	},
	setItem: async <T>(key: string, value: T): Promise<void> => {
		localStorage.setItem(key, JSON.stringify(value));
	},
	removeItem: async (key: string): Promise<void> => {
		localStorage.removeItem(key);
	},
};
