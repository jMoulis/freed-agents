import { InMemoryOntoStore } from "@/core/onto-store";

declare global {
  var __discoveryStore: InMemoryOntoStore | undefined;
}

if (!global.__discoveryStore) {
  global.__discoveryStore = new InMemoryOntoStore();
}

export const discoveryStore = global.__discoveryStore;
