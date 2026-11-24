import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { frameStore } from '../../core/frameStore';
import { ActionBar, ControlsTable } from '../ActionBar';
import { useBus } from '../hooks';
import { OBJECT_ACTIONS } from './actions';
import type { ObjectAction } from './actions';
import { ObjectModel } from './model';

/** 3D Object: two open palms zoom and rotate it, a clap resets it. Lazy-loaded: it carries Three.js. */
export default function Object3D() {
  const model = useMemo(() => new ObjectModel(), []);
  const mount = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [read, setRead] = useState({ scale: 1, rot: 0, engaged: false });

  const handlers: Record<ObjectAction, () => void> = useMemo(
    () => ({
      zoomIn: () => model.zoomBy(1.12),
      zoomOut: () => model.zoomBy(1 / 1.12),
      rotateLeft: () => model.rotateBy(10),
      rotateRight: () => model.rotateBy(-10),
      reset: () => model.reset(),
    }),
    [model],
  );
  // A clap arrives on the event bus.
  useBus('gesture:clap', () => model.reset());

  const setup = useCallback(() => {
    const el = mount.current;
    if (!el) return () => {};
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      requestAnimationFrame(() => setFailed(true)); // from a callback: not synchronously inside the effect
      return () => {};
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 9); // far enough that the 3x maximum still fits in the frame
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(3, 4, 5);
    scene.add(sun);
    const geometry = new THREE.TorusKnotGeometry(1, 0.34, 160, 24);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3987e5,
      roughness: 0.35,
      metalness: 0.25,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    let scale = 1;
    let rot = 0;
    let spin = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      model.frame(frameStore.getState().twoHand);
      // Ease toward the model's target so jittery hands still give a smooth object.
      const k = 1 - Math.exp(-dt / 90);
      scale += k * (model.scale - scale);
      rot += k * (model.rotationDeg - rot);
      if (!reduce) spin += dt * 0.0004;
      mesh.scale.setScalar(scale);
      mesh.rotation.z = (rot * Math.PI) / 180;
      mesh.rotation.y = spin;
      mesh.rotation.x = 0.35;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const readout = setInterval(
      () =>
        setRead({
          scale: model.scale,
          rot: model.rotationDeg,
          engaged: frameStore.getState().twoHand.engaged,
        }),
      100,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(readout);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model]);
  useEffect(() => setup(), [setup]);

  return (
    <div className="space-y-3">
      <div
        ref={mount}
        className="relative aspect-[4/3] w-full rounded-sm border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950"
        data-testid="object3d-view"
      >
        {failed && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-neutral-400">
            3D is not available in this browser (WebGL could not start).
          </p>
        )}
        <div
          className="pointer-events-none absolute left-3 top-3 rounded-sm border border-line bg-bg/85 px-2 py-1 font-mono text-[11px] text-mute"
          data-testid="object3d-readout"
        >
          Zoom {read.scale.toFixed(2)}x · Rotation {(((read.rot % 360) + 360) % 360).toFixed(0)}° ·{' '}
          {read.engaged ? 'two palms held' : 'show two open palms'}
        </div>
      </div>
      <ActionBar actions={OBJECT_ACTIONS} handlers={handlers} />
      <ControlsTable actions={OBJECT_ACTIONS} />
    </div>
  );
}
