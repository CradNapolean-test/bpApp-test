'use client';

import { useEffect, useRef } from 'react';
import { IDENTITY, panBy, toggleZoom, zoomAt, zoomKeyAction } from '@/lib/zoomPan';
import type { ZoomPan } from '@/lib/zoomPan';

// A photo you can pinch, scroll-wheel or double-tap to zoom, and drag to move. Controlled, so two photos
// can share one transform and zoom together in the before/after view.
//
// It works without a mouse too (ZP1): focus it and press + or - to zoom, the arrow keys to move it, 0 to put it back. The handlers read the
// current value through a ref, so a drag or a pinch that is already under way never works from an out-of-date zoom (a pointer-move arriving
// between renders used to apply to the old value). The wheel listener is a native one that is not passive, so scrolling the wheel over the
// photo zooms it and does not also scroll the page behind.
export function ZoomablePhoto({
  src,
  alt,
  value,
  onChange,
  className = '',
}: {
  src: string;
  alt: string;
  value: ZoomPan;
  onChange: (t: ZoomPan) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);
  const lastTap = useRef(0);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const size = () => {
    const r = box.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1, left: r?.left ?? 0, top: r?.top ?? 0 };
  };
  // A client point -> pixels relative to the centre of the box.
  const fromCentre = (clientX: number, clientY: number) => {
    const { w, h, left, top } = size();
    return { cx: clientX - left - w / 2, cy: clientY - top - h / 2 };
  };

  // The wheel: native and not passive, so preventDefault really stops the page scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      onChangeRef.current(zoomAt(valueRef.current, e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy, r.width, r.height));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinch.current = null;
    const now = Date.now();
    if (pointers.current.size === 1 && now - lastTap.current < 300) {
      const { w, h } = size();
      const { cx, cy } = fromCentre(e.clientX, e.clientY);
      onChangeRef.current(toggleZoom(valueRef.current, cx, cy, w, h));
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const { w, h } = size();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const current = valueRef.current;
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinch.current != null && lastPinch.current > 0) {
        const mid = fromCentre((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        const next = zoomAt(current, dist / lastPinch.current, mid.cx, mid.cy, w, h);
        valueRef.current = next;
        onChangeRef.current(next);
      }
      lastPinch.current = dist;
    } else if (current.scale > 1) {
      const next = panBy(current, e.clientX - prev.x, e.clientY - prev.y, w, h);
      valueRef.current = next;
      onChangeRef.current(next);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    lastPinch.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const action = zoomKeyAction(e.key);
    if (!action) return;
    e.preventDefault();
    const { w, h } = size();
    if (action.type === 'reset') onChangeRef.current(IDENTITY);
    else if (action.type === 'zoom') onChangeRef.current(zoomAt(valueRef.current, action.factor, 0, 0, w, h));
    else onChangeRef.current(panBy(valueRef.current, action.dx, action.dy, w, h));
  }

  const t = value; // every update is already clamped by the zoomPan helpers
  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={`${alt}. Zoomable: press plus or minus to zoom, the arrow keys to move, 0 to reset.`}
      className={`touch-none select-none overflow-hidden ${value.scale > 1 ? 'cursor-grab' : 'cursor-zoom-in'} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="h-full w-full object-cover"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: 'center' }}
      />
    </div>
  );
}

export { IDENTITY };
