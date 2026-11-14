import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { meanEmbedding } from '../features/face/matching';

/** A registered person: a name and face embeddings only. Photos and video frames are never stored. */
export interface Person {
  id: string;
  name: string;
  /** L2-normalised embeddings of the good frames captured at registration. */
  embeddings: Float32Array[];
  /** L2-normalised mean of `embeddings`, what recognition compares against. */
  meanEmbedding: Float32Array;
  /** Which embedding model produced these. Embeddings from another model are not comparable. */
  modelId: string;
  createdAt: number;
}

interface Schema extends DBSchema {
  people: { key: string; value: Person };
}

const DB_NAME = 'senselab';
const STORE = 'people';
const EXPORT_APP = 'senselab-people';
const EXPORT_VERSION = 1;

/** Sanity limits for imported files, so a corrupt or hostile file cannot flood the database. */
const MAX_PEOPLE = 500;
const MAX_EMBEDDINGS = 200;
const MAX_NAME = 100;

export interface ExportFile {
  app: typeof EXPORT_APP;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  people: {
    id: string;
    name: string;
    modelId: string;
    createdAt: number;
    embeddings: number[][];
  }[];
}

export interface ImportReport {
  added: number;
  replaced: number;
  skipped: { name: string; reason: string }[];
}

export class ImportError extends Error {}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** IndexedDB-backed people store. */
export class PeopleStore {
  private db: Promise<IDBPDatabase<Schema>> | null = null;

  private open() {
    return (this.db ??= openDB<Schema>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      },
    }));
  }

  async list(): Promise<Person[]> {
    const all = await (await this.open()).getAll(STORE);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<Person | undefined> {
    return (await this.open()).get(STORE, id);
  }

  /** Creates a person from the captured embeddings (mean is computed here). */
  async add(
    name: string,
    embeddings: Float32Array[],
    modelId: string,
    now = Date.now(),
  ): Promise<Person> {
    const clean = name.trim();
    if (!clean) throw new Error('A name is required');
    if (embeddings.length === 0) throw new Error('At least one embedding is required');
    const dim = embeddings[0]!.length;
    if (embeddings.some((e) => e.length !== dim))
      throw new Error('Embeddings must all have the same length');
    const person: Person = {
      id: newId(),
      name: clean.slice(0, MAX_NAME),
      embeddings,
      meanEmbedding: meanEmbedding(embeddings),
      modelId,
      createdAt: now,
    };
    await (await this.open()).put(STORE, person);
    return person;
  }

  async remove(id: string): Promise<void> {
    await (await this.open()).delete(STORE, id);
  }

  /** Deletes every person. */
  async clear(): Promise<void> {
    await (await this.open()).clear(STORE);
  }

  /** Everything as a JSON-serialisable object. Means are not exported: they are recomputed on import. */
  async exportData(now = new Date()): Promise<ExportFile> {
    const people = await this.list();
    return {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        modelId: p.modelId,
        createdAt: p.createdAt,
        embeddings: p.embeddings.map((e) => Array.from(e, (v) => Math.round(v * 1e6) / 1e6)),
      })),
    };
  }

  /**
   * Imports an export file. Every field is validated; bad entries are skipped and reported, and a file
   * that is not an export at all throws ImportError without touching the database. Same ID = replace.
   * @param expectedModelId people made with a different model cannot be matched, so they are skipped.
   */
  async importData(data: unknown, expectedModelId?: string): Promise<ImportReport> {
    if (!data || typeof data !== 'object') throw new ImportError('Not a SenseLab export file');
    const file = data as Partial<ExportFile>;
    if (file.app !== EXPORT_APP) throw new ImportError('Not a SenseLab export file');
    if (file.version !== EXPORT_VERSION)
      throw new ImportError(`Unsupported export version: ${String(file.version)}`);
    if (!Array.isArray(file.people)) throw new ImportError('The file has no people list');
    if (file.people.length > MAX_PEOPLE)
      throw new ImportError(`Too many people (limit ${MAX_PEOPLE})`);

    const report: ImportReport = { added: 0, replaced: 0, skipped: [] };
    const db = await this.open();
    for (const raw of file.people) {
      const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, MAX_NAME) : '';
      const skip = (reason: string) => report.skipped.push({ name: name || '(unnamed)', reason });
      if (!name) {
        skip('missing name');
        continue;
      }
      if (typeof raw.modelId !== 'string' || !raw.modelId) {
        skip('missing model id');
        continue;
      }
      if (expectedModelId && raw.modelId !== expectedModelId) {
        skip(`made with a different model (${raw.modelId})`);
        continue;
      }
      const embs = raw.embeddings;
      if (!Array.isArray(embs) || embs.length === 0 || embs.length > MAX_EMBEDDINGS) {
        skip('no embeddings, or too many');
        continue;
      }
      const dim = Array.isArray(embs[0]) ? embs[0].length : 0;
      const valid =
        dim > 0 &&
        dim <= 4096 &&
        embs.every(
          (e) =>
            Array.isArray(e) &&
            e.length === dim &&
            e.every((v) => typeof v === 'number' && Number.isFinite(v)),
        );
      if (!valid) {
        skip('embeddings are malformed');
        continue;
      }
      const vectors = embs.map((e) => {
        const f = Float32Array.from(e as number[]);
        let n = 0;
        for (const v of f) n += v * v;
        n = Math.sqrt(n);
        if (n > 0) for (let i = 0; i < f.length; i++) f[i]! /= n;
        return f;
      });
      const id =
        typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 100 ? raw.id : newId();
      const existed = (await db.get(STORE, id)) !== undefined;
      await db.put(STORE, {
        id,
        name,
        embeddings: vectors,
        meanEmbedding: meanEmbedding(vectors),
        modelId: raw.modelId,
        createdAt:
          typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
            ? raw.createdAt
            : Date.now(),
      });
      if (existed) report.replaced++;
      else report.added++;
    }
    return report;
  }
}

export const peopleStore = new PeopleStore();
