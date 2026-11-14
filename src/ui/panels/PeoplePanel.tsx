import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVE_IDENTITY_MODEL } from '../../features/face/identityModel';
import { identityService } from '../../features/face/identityService';
import { ImportError, peopleStore } from '../../storage/peopleStore';
import type { Person } from '../../storage/peopleStore';

/** Registered people: delete one, delete all, export and import JSON. Names and embeddings only. */
export function PeoplePanel() {
  const [people, setPeople] = useState<Person[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setPeople(await identityService.loadPeople());
  }, []);
  useEffect(() => {
    // Load shortly after mount, then poll lightly: registration finishing elsewhere changes the list.
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 1500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  const remove = async (p: Person) => {
    await peopleStore.remove(p.id);
    await refresh();
  };

  const deleteAll = async () => {
    if (
      !window.confirm(
        'Delete every registered person and all saved settings? This cannot be undone.',
      )
    )
      return;
    await peopleStore.clear();
    identityService.resetSettings();
    await refresh();
    setMessage('All data deleted.');
  };

  const exportJson = async () => {
    const data = await peopleStore.exportData();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `senselab-people-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const report = await peopleStore.importData(
        JSON.parse(await file.text()),
        ACTIVE_IDENTITY_MODEL.id,
      );
      const skipped = report.skipped.length
        ? ` Skipped ${report.skipped.length}: ${report.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.`
        : '';
      setMessage(`Imported ${report.added} new, ${report.replaced} replaced.${skipped}`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof ImportError ? err.message : 'Could not read that file.');
    }
  };

  return (
    <section aria-label="People" className="w-80 space-y-3 rounded-lg bg-neutral-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">People</h2>
      {people.length === 0 && <p className="text-sm text-neutral-500">Nobody registered yet.</p>}
      <ul className="space-y-1">
        {people.map((p) => (
          <li key={p.id} data-testid="person" className="flex items-center justify-between text-sm">
            <span>
              {p.name} <span className="text-neutral-500">· {p.embeddings.length} frames</span>
              {p.modelId !== ACTIVE_IDENTITY_MODEL.id && (
                <span className="text-amber-400"> · other model</span>
              )}
            </span>
            <button
              className="text-neutral-400 hover:text-red-400"
              onClick={() => void remove(p)}
              aria-label={`Delete ${p.name}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
          onClick={() => void exportJson()}
        >
          Export JSON
        </button>
        <button
          className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
          onClick={() => fileRef.current?.click()}
        >
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import people file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
        <button
          className="rounded bg-red-900 px-2 py-1 hover:bg-red-800"
          onClick={() => void deleteAll()}
        >
          Delete all data
        </button>
      </div>
      {message && (
        <p role="status" className="text-xs text-neutral-300">
          {message}
        </p>
      )}
      <p className="text-xs text-neutral-500">
        Only names and face embeddings are saved, on this device. Never photos or video.
      </p>
    </section>
  );
}
