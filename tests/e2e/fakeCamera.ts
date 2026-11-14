import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * A fake camera for the end-to-end tests: a 640x480 canvas stream the test controls. It can show one photo, two
 * faces side by side (left half / right half of the RAW frame; the on-screen view is mirrored), and a hand photo
 * that slides across. Photos come from a folder of named .jpg files (FACE_FIXTURES).
 */
export const FIXTURE_NAMES = [
  'happy',
  'neutral',
  'open',
  'closed',
  'gazeCentre',
  'surprised',
  'victory',
  'thumb_up',
];

export async function installFakeCamera(
  page: Page,
  dir: string,
  names: readonly string[] = FIXTURE_NAMES,
) {
  const images: Record<string, string> = {};
  for (const n of names) images[n] = readFileSync(join(dir, `${n}.jpg`)).toString('base64');
  await page.addInitScript((imgs) => {
    const loaded: Record<string, HTMLImageElement> = {};
    const w = window as unknown as Record<string, unknown>;
    // Scene: one face, two faces (left half, right half), and an optional hand overlay.
    const scene = { single: 'blank', left: '', right: '', hand: '', handX: 100, handY: 80 };
    w.__scene = scene;
    w.__show = (n: string) => {
      scene.single = n;
      scene.left = scene.right = '';
    };
    w.__showTwo = (left: string, right: string) => {
      scene.single = '';
      scene.left = left;
      scene.right = right;
    };
    w.__setRight = (n: string) => (scene.right = n);
    w.__setHand = (n: string) => (scene.hand = n);
    /** Slides the hand photo horizontally from x0 to x1 over ms (raw frame pixels), eased like an arm. */
    w.__slideHand = (x0: number, x1: number, ms: number) =>
      new Promise<void>((resolve) => {
        const t0 = performance.now();
        const step = () => {
          const u = Math.min(1, (performance.now() - t0) / ms);
          const e = u * u * (3 - 2 * u);
          scene.handX = x0 + (x1 - x0) * e;
          if (u < 1) requestAnimationFrame(step);
          else resolve();
        };
        step();
      });
    const fakeGetUserMedia = async () => {
      for (const [k, b64] of Object.entries(imgs)) {
        const im = new Image();
        im.src = `data:image/jpeg;base64,${b64}`;
        await im.decode();
        loaded[k] = im;
      }
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d')!;
      setInterval(() => {
        ctx.fillStyle = '#707070';
        ctx.fillRect(0, 0, 640, 480);
        if (scene.single && loaded[scene.single])
          ctx.drawImage(loaded[scene.single]!, 80, 0, 480, 480);
        if (scene.left && loaded[scene.left]) ctx.drawImage(loaded[scene.left]!, 0, 80, 320, 320);
        if (scene.right && loaded[scene.right])
          ctx.drawImage(loaded[scene.right]!, 320, 80, 320, 320);
        const hand = loaded[scene.hand];
        if (hand)
          ctx.drawImage(hand, scene.handX, scene.handY, (hand.width / hand.height) * 220, 220);
      }, 33);
      return c.captureStream(30);
    };
    // The prototype, not the instance: WebKit does not keep properties set on navigator.mediaDevices.
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      value: fakeGetUserMedia,
      configurable: true,
      writable: true,
    });
  }, images);
}

export async function startApp(page: Page, tab: string) {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.getByRole('button', { name: tab, exact: true }).click();
}

/**
 * Resolves once the face and hand models are loaded. Models load on first use, so "the pipeline is running" no
 * longer means "the models are ready": wait for their load state (the dev hook exposes the live store).
 */
export const waitModels = (page: Page) =>
  page.waitForFunction(
    () => {
      const hook = (
        window as unknown as {
          __senselab?: {
            liveStore: { getState: () => { modelLoad: Record<string, { state: string }> } };
          };
        }
      ).__senselab;
      const m = hook?.liveStore.getState().modelLoad;
      return m?.face?.state === 'ready' && m?.hand?.state === 'ready';
    },
    undefined,
    { timeout: 60_000 },
  );

export const call = <A extends unknown[]>(page: Page, fn: string, ...args: A) =>
  page.evaluate(
    ([f, a]) =>
      (window as unknown as Record<string, (...x: unknown[]) => unknown>)[f as string]!(
        ...(a as unknown[]),
      ),
    [fn, args] as const,
  );
