import { Suspense, lazy, useState } from 'react';
import { DEMOS } from '../../demos/registry';

// Created once, outside the component: a lazy component made during render would reload on every render.
const ELEMENTS = new Map(
  DEMOS.map((d) => {
    const Lazy = lazy(d.load);
    return [d.id, <Lazy key={d.id} />] as const;
  }),
);

/** The picker and the selected demo. Each demo is its own lazy chunk, so nothing loads until it is opened. */
export default function PlaygroundPage() {
  const [id, setId] = useState(DEMOS[0]!.id);
  const demo = DEMOS.find((d) => d.id === id)!;

  return (
    <section aria-label="Playground" className="w-full min-w-0 space-y-4">
      <div
        role="tablist"
        aria-label="Demos"
        className="flex flex-wrap gap-x-5 border-b border-line"
      >
        {DEMOS.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === id}
            data-testid={`demo-tab-${d.id}`}
            className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${d.id === id ? 'border-accent text-ink' : 'border-transparent text-mute hover:text-ink'}`}
            onClick={() => setId(d.id)}
          >
            {d.title}
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-400">{demo.summary}</p>
      <div key={id} className="animate-fade-in">
        <Suspense
          fallback={
            <p className="py-10 text-center text-sm text-neutral-500">Loading {demo.title}...</p>
          }
        >
          {ELEMENTS.get(id)}
        </Suspense>
      </div>
    </section>
  );
}
