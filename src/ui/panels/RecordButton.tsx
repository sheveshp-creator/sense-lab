import { handRecorder } from '../../core/recorder';

/**
 * Dev-only: saves the last 2 seconds of raw hand landmarks as a JSON fixture for tests/fixtures/.
 * Landmarks only, never images. Hidden in production builds.
 */
export function RecordButton() {
  if (!import.meta.env.DEV) return null;
  const save = () => {
    const fixture = handRecorder.toFixture(2000);
    const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hands-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <button
      className="w-80 rounded bg-neutral-800 px-3 py-2 text-left text-sm hover:bg-neutral-700"
      onClick={save}
    >
      Record last 2 s as fixture <span className="text-neutral-500">(dev)</span>
    </button>
  );
}
