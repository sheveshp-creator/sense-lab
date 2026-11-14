import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionBar, ControlsTable } from '../src/demos/ActionBar';
import { DEMOS } from '../src/demos/registry';

const SRC = resolve(import.meta.dirname, '../src');
const DEMOS_DIR = join(SRC, 'demos');

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

/** Everything a file imports, static and dynamic. */
const imports = (file: string): string[] => {
  const code = readFileSync(file, 'utf8');
  return [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
};

/**
 * What a demo may import from outside src/demos: the live frame store, the event bus, two plain-data modules
 * (blendshape names and the expression labels), the swipe-sensitivity settings and a chart component. No model, no worker, no pipeline.
 */
const ALLOWED_PROJECT = new Set([
  'core/frameStore',
  'events/bus',
  'features/face/blendshapes',
  'features/face/expression',
  'features/hand/dynamic/swipeSensitivity',
  'ui/components/MultiLineChart',
]);
const ALLOWED_PACKAGES = new Set([
  'react',
  'react/jsx-runtime',
  'zustand',
  'three',
  'framer-motion',
]);

describe('demos only use the event bus and the store (no direct model access)', () => {
  const demoFiles = files(DEMOS_DIR);

  it('finds the demo sources', () => {
    expect(demoFiles.length).toBeGreaterThan(15);
  });

  it('every import is a package on the allow-list, another demo file, or one of the few allowed project modules', () => {
    const bad: string[] = [];
    for (const f of demoFiles) {
      for (const spec of imports(f)) {
        if (spec.startsWith('.')) {
          const target = resolve(dirname(f), spec);
          const inDemos = !relative(DEMOS_DIR, target).startsWith('..');
          const rel = relative(SRC, target).replace(/\\/g, '/');
          if (!inDemos && !ALLOWED_PROJECT.has(rel))
            bad.push(`${relative(SRC, f)} imports ${spec}`);
        } else if (!ALLOWED_PACKAGES.has(spec))
          bad.push(`${relative(SRC, f)} imports package ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never touches the models, the worker, the pipeline or the writers of the store', () => {
    const forbidden =
      /@mediapipe|onnxruntime|core\/pipeline|core\/worker|features\/(face|hand)\/detect|publishFrame|simulate\(|new Worker|createImageBitmap/;
    const hits = demoFiles
      .filter((f) => forbidden.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(hits).toEqual([]);
  });

  it('the check itself works: it would catch a demo that imported the pipeline', () => {
    const sample = "import { live } from '../../core/pipeline';";
    expect(
      [...sample.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ).toEqual(['../../core/pipeline']);
    expect(ALLOWED_PROJECT.has('core/pipeline')).toBe(false);
  });
});

describe('every action has a button and a keyboard shortcut', () => {
  it('has the six demos from the brief, with unique ids', () => {
    expect(DEMOS.map((d) => d.title)).toEqual([
      'Air Draw',
      'Slide Remote',
      '3D Object',
      'Mirror Avatar',
      'Blink Battle',
      'Mood Meter',
    ]);
    expect(new Set(DEMOS.map((d) => d.id)).size).toBe(DEMOS.length);
  });

  for (const demo of DEMOS) {
    describe(demo.title, () => {
      it('has a title, a summary and a lazy loader', () => {
        expect(demo.title.length).toBeGreaterThan(2);
        expect(demo.summary.length).toBeGreaterThan(10);
        expect(typeof demo.load).toBe('function');
      });

      it('gives every action a label, a key and its key label; ids and keys do not clash', () => {
        const ids = demo.actions.map((a) => a.id);
        const keys = demo.actions.flatMap((a) =>
          [a.key, ...(a.altKeys ?? [])].map((k) => k.toLowerCase()),
        );
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(keys).size).toBe(keys.length);
        for (const a of demo.actions) {
          expect(a.label.length).toBeGreaterThan(2);
          expect(a.key.length).toBeGreaterThan(0);
          expect(a.keyLabel.length).toBeGreaterThan(0);
        }
      });

      it('renders a button for every action, with its shortcut announced, and a controls table', () => {
        const noop = Object.fromEntries(demo.actions.map((a) => [a.id, () => {}]));
        const html = renderToStaticMarkup(
          createElement(ActionBar, { actions: demo.actions, handlers: noop }),
        );
        for (const a of demo.actions) {
          expect(html).toContain(`data-action="${a.id}"`);
          expect(html).toContain(a.label);
          expect(html).toContain('aria-keyshortcuts');
        }
        expect((html.match(/<button/g) ?? []).length).toBe(demo.actions.length);
        const table = renderToStaticMarkup(createElement(ControlsTable, { actions: demo.actions }));
        for (const a of demo.actions) expect(table).toContain(a.label);
      });
    });
  }

  it('covers every gesture the brief names, each with a button and a key', () => {
    const gestureOf = (demoId: string) =>
      DEMOS.find((d) => d.id === demoId)!
        .actions.map((a) => a.gesture ?? '')
        .join(' | ');
    expect(gestureOf('air-draw')).toMatch(/pinch/i);
    expect(gestureOf('air-draw')).toMatch(/open palm/i);
    expect(gestureOf('air-draw')).toMatch(/peace/i);
    expect(gestureOf('slide-remote')).toMatch(/swipe left/i);
    expect(gestureOf('slide-remote')).toMatch(/swipe right/i);
    expect(gestureOf('slide-remote')).toMatch(/thumbs up/i);
    expect(gestureOf('object-3d')).toMatch(/apart/i);
    expect(gestureOf('object-3d')).toMatch(/together/i);
    expect(gestureOf('object-3d')).toMatch(/clockwise/i);
    expect(gestureOf('object-3d')).toMatch(/clap/i);
    expect(gestureOf('blink-battle')).toMatch(/blinks/i);
    // The avatar and mood meter have no gesture actions; the avatar has manual sliders instead.
    expect(DEMOS.find((d) => d.id === 'mirror-avatar')!.actions).toHaveLength(0);
    const avatarSource = readFileSync(join(DEMOS_DIR, 'avatar/Demo.tsx'), 'utf8');
    expect(avatarSource).toContain('type="range"');
  });
});
