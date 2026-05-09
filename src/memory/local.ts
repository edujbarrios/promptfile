/**
 * Local file-based memory backend.
 * Stores conversation history as a JSON file under ~/.promptfile/memory/<name>.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Memory, MemoryEntry } from './index.js';

export class LocalMemory implements Memory {
  readonly name: string;
  readonly backend = 'local';
  private filePath: string;
  private entries: MemoryEntry[];

  constructor(name: string, options?: { dir?: string }) {
    this.name = name;
    const dir =
      options?.dir ?? join(process.env['HOME'] ?? '.', '.promptfile', 'memory');
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, `${name}.json`);
    this.entries = this.load();
  }

  private load(): MemoryEntry[] {
    if (!existsSync(this.filePath)) return [];
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8')) as MemoryEntry[];
    } catch {
      return [];
    }
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  async add(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    const full: MemoryEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.entries.push(full);
    this.save();
    return full;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const lower = query.toLowerCase();
    return this.entries
      .filter(
        (e) =>
          e.instruction.toLowerCase().includes(lower) ||
          e.response.toLowerCase().includes(lower),
      )
      .slice(-limit);
  }

  async list(limit = 50): Promise<MemoryEntry[]> {
    return this.entries.slice(-limit);
  }

  async clear(): Promise<void> {
    this.entries = [];
    this.save();
  }
}
