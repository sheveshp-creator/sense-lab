import { useEffect } from 'react';
import type { ActionSpec } from './types';

/** True if the keystroke is meant for a form control, not for a shortcut. */
function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable)
  );
}

/**
 * Buttons for every action of a demo, plus its keyboard shortcuts. `handlers` must cover every action id (the
 * type checker enforces it), which is what guarantees each action is reachable without the camera.
 */
export function ActionBar<Id extends string>({
  actions,
  handlers,
}: {
  actions: readonly ActionSpec<Id>[];
  handlers: Record<Id, () => void>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingInField(e)) return;
      const k = e.key.toLowerCase();
      const spec = actions.find(
        (a) => a.key.toLowerCase() === k || a.altKeys?.some((x) => x.toLowerCase() === k),
      );
      if (!spec || (e.repeat && !spec.repeat)) return;
      // A focused button of THIS bar activates itself on Space / Enter: do not also fire the shortcut.
      // Any other focused button (say the demo picker tab you just clicked) must not swallow the shortcut.
      const target = e.target as HTMLElement | null;
      if (
        (e.key === ' ' || e.key === 'Enter') &&
        target?.tagName === 'BUTTON' &&
        target.closest('[data-action-bar]')
      )
        return;
      e.preventDefault();
      handlers[spec.id]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, handlers]);

  return (
    <div role="group" aria-label="Controls" data-action-bar className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          data-action={a.id}
          aria-keyshortcuts={a.key === ' ' ? 'Space' : a.key}
          title={a.gesture ? `Gesture: ${a.gesture}` : undefined}
          className="btn inline-flex items-center gap-2"
          onClick={() => handlers[a.id]()}
        >
          {a.label}
          <kbd className="border border-line px-1 font-mono text-[11px] text-faint">
            {a.keyLabel}
          </kbd>
        </button>
      ))}
    </div>
  );
}

/** The same mapping as a table: gesture, button and key side by side. */
export function ControlsTable({ actions }: { actions: readonly ActionSpec[] }) {
  return (
    <details className="text-sm text-neutral-300">
      <summary className="cursor-pointer select-none text-neutral-400 hover:text-neutral-200">
        How to control this demo
      </summary>
      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-1 font-normal">Action</th>
            <th className="font-normal">Gesture</th>
            <th className="font-normal">Button</th>
            <th className="font-normal">Key</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id} className="border-t border-neutral-800">
              <td className="py-1">{a.label}</td>
              <td>{a.gesture ?? '-'}</td>
              <td>yes</td>
              <td>
                <kbd className="font-mono">{a.keyLabel}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
