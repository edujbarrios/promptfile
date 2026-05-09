/** Core memory interface. All backends implement this. */
export interface MemoryEntry {
  id: string;
  timestamp: string;
  instruction: string;
  response: string;
  metadata?: Record<string, unknown>;
}

export interface Memory {
  readonly name: string;
  readonly backend: string;
  add(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry>;
  get(id: string): Promise<MemoryEntry | null>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  list(limit?: number): Promise<MemoryEntry[]>;
  clear(): Promise<void>;
}
