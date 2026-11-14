import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImportError, PeopleStore } from '../src/storage/peopleStore';
import { l2Normalize } from '../src/features/face/matching';

const unit = (...v: number[]) => l2Normalize(Float32Array.from(v));
const MODEL = 'test-model';
let store: PeopleStore;

beforeEach(async () => {
  store = new PeopleStore();
  await store.clear();
});

describe('PeopleStore', () => {
  it('adds a person with a normalised mean embedding and lists people oldest first', async () => {
    const a = await store.add('  Alice  ', [unit(1, 0, 0), unit(0, 1, 0)], MODEL, 1000);
    await store.add('Bob', [unit(0, 0, 1)], MODEL, 2000);
    expect(a.name).toBe('Alice'); // trimmed
    expect(Math.hypot(...a.meanEmbedding)).toBeCloseTo(1, 5);
    expect(a.meanEmbedding[0]).toBeCloseTo(Math.SQRT1_2, 5);
    const all = await store.list();
    expect(all.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect((await store.get(a.id))!.embeddings).toHaveLength(2);
    expect((await store.get(a.id))!.embeddings[0]).toBeInstanceOf(Float32Array);
  });

  it('rejects an empty name, no embeddings, and mixed lengths', async () => {
    await expect(store.add('   ', [unit(1, 0)], MODEL)).rejects.toThrow(/name/i);
    await expect(store.add('A', [], MODEL)).rejects.toThrow(/embedding/i);
    await expect(store.add('A', [unit(1, 0), unit(1, 0, 0)], MODEL)).rejects.toThrow(
      /same length/i,
    );
    expect(await store.list()).toEqual([]);
  });

  it('deletes one person without touching the others', async () => {
    const a = await store.add('Alice', [unit(1, 0)], MODEL);
    const b = await store.add('Bob', [unit(0, 1)], MODEL);
    await store.remove(a.id);
    expect((await store.list()).map((p) => p.id)).toEqual([b.id]);
    await store.remove('does-not-exist'); // deleting nothing is not an error
    expect(await store.list()).toHaveLength(1);
  });

  it('deletes everything', async () => {
    await store.add('A', [unit(1, 0)], MODEL);
    await store.add('B', [unit(0, 1)], MODEL);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('stores only a name, embeddings and metadata: no image fields exist on a person', async () => {
    const p = await store.add('Alice', [unit(1, 0)], MODEL);
    expect(Object.keys(p).sort()).toEqual([
      'createdAt',
      'embeddings',
      'id',
      'meanEmbedding',
      'modelId',
      'name',
    ]);
  });
});

describe('export / import', () => {
  it('round-trips: export, delete everything, import gives the same people and means', async () => {
    const a = await store.add('Alice', [unit(1, 2, 3), unit(1, 2, 4)], MODEL, 111);
    const b = await store.add('Bob', [unit(3, 2, 1)], MODEL, 222);
    const file = JSON.parse(JSON.stringify(await store.exportData()));
    await store.clear();
    const report = await store.importData(file, MODEL);
    expect(report).toEqual({ added: 2, replaced: 0, skipped: [] });
    const back = await store.list();
    expect(back.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(back[0]!.id).toBe(a.id);
    expect(back[1]!.createdAt).toBe(b.createdAt);
    for (let i = 0; i < 3; i++)
      expect(back[0]!.meanEmbedding[i]).toBeCloseTo(a.meanEmbedding[i]!, 5);
    expect(back[0]!.embeddings).toHaveLength(2);
  });

  it('the export has names, ids and numbers only, and no mean (it is recomputed on import)', async () => {
    await store.add('Alice', [unit(1, 0)], MODEL);
    const file = await store.exportData(new Date('2026-01-01T00:00:00Z'));
    expect(file).toMatchObject({
      app: 'senselab-people',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(Object.keys(file.people[0]!).sort()).toEqual([
      'createdAt',
      'embeddings',
      'id',
      'modelId',
      'name',
    ]);
    expect(file.people[0]!.embeddings[0]!.every((v) => typeof v === 'number')).toBe(true);
  });

  it('importing the same file again replaces by ID instead of duplicating', async () => {
    await store.add('Alice', [unit(1, 0)], MODEL);
    const file = JSON.parse(JSON.stringify(await store.exportData()));
    const report = await store.importData(file, MODEL);
    expect(report).toMatchObject({ added: 0, replaced: 1 });
    expect(await store.list()).toHaveLength(1);
  });

  it('refuses files that are not exports, without touching existing data', async () => {
    await store.add('Alice', [unit(1, 0)], MODEL);
    for (const bad of [
      null,
      'text',
      42,
      {},
      { app: 'other', version: 1, people: [] },
      { app: 'senselab-people', version: 99, people: [] },
      { app: 'senselab-people', version: 1 },
    ]) {
      await expect(store.importData(bad, MODEL)).rejects.toBeInstanceOf(ImportError);
    }
    expect(await store.list()).toHaveLength(1);
  });

  it('skips bad entries and reports why, keeping the good ones', async () => {
    const good = { id: 'g', name: 'Good', modelId: MODEL, createdAt: 5, embeddings: [[1, 0, 0]] };
    const file = {
      app: 'senselab-people',
      version: 1,
      people: [
        good,
        { ...good, id: 'n', name: '' },
        { ...good, id: 'm', name: 'OtherModel', modelId: 'different' },
        {
          ...good,
          id: 'r',
          name: 'Ragged',
          embeddings: [
            [1, 0, 0],
            [1, 0],
          ],
        },
        { ...good, id: 'x', name: 'NaN', embeddings: [[1, Number.NaN, 0]] },
        { ...good, id: 's', name: 'Strings', embeddings: [['a', 'b', 'c']] },
        { ...good, id: 'e', name: 'Empty', embeddings: [] },
        { ...good, id: 'z', name: 'NoModel', modelId: undefined },
        'not even an object',
      ],
    };
    const report = await store.importData(JSON.parse(JSON.stringify(file)), MODEL);
    expect(report.added).toBe(1);
    expect(report.skipped).toHaveLength(8);
    expect(report.skipped.map((s) => s.reason).join('|')).toMatch(/model/);
    expect((await store.list()).map((p) => p.name)).toEqual(['Good']);
  });

  it('normalises imported vectors, truncates long names and generates an id when missing', async () => {
    const file = {
      app: 'senselab-people',
      version: 1,
      people: [{ name: 'x'.repeat(500), modelId: MODEL, embeddings: [[3, 4]] }],
    };
    await store.importData(file, MODEL);
    const [p] = await store.list();
    expect(p!.name).toHaveLength(100);
    expect(Math.hypot(...p!.embeddings[0]!)).toBeCloseTo(1, 5);
    expect(p!.id.length).toBeGreaterThan(8);
  });

  it('enforces size limits so a hostile file cannot flood the database', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      id: `${i}`,
      name: 'n',
      modelId: MODEL,
      embeddings: [[1, 0]],
    }));
    await expect(
      store.importData({ app: 'senselab-people', version: 1, people: many }, MODEL),
    ).rejects.toBeInstanceOf(ImportError);
    const tooManyEmb = {
      id: 'a',
      name: 'n',
      modelId: MODEL,
      embeddings: Array.from({ length: 201 }, () => [1, 0]),
    };
    const r = await store.importData(
      { app: 'senselab-people', version: 1, people: [tooManyEmb] },
      MODEL,
    );
    expect(r.skipped).toHaveLength(1);
    expect(await store.list()).toEqual([]);
  });
});
