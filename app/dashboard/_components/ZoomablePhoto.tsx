'use client';

import { useRef } from 'react';
import { IDENTITY, panBy, toggleZoom, zoomAt } from '@/lib/zoomPan';
import type { ZoomPan } from '@/lib/zoomPan';

// A photo you can pinch, scroll-wheel or double-tap to zoom, and drag to move. Controlled, so two photos
// can share one transform and zoom together in the before/after view.
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

  const size = () => {
    const r = box.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1, left: r?.left ?? 0, top: r?.top ?? 0 };
  };
  // A client point -> pixels relative to the centre of the box.
  const fromCentre = (clientX: number, clientY: number) => {
    const { w, h, left, top } = size();
    return { cx: clientX - left - w / 2, cy: clientY - top - h / 2 };
  };

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinch.current = null;
    const now = Date.now();
    if (pointers.current.size === 1 && now - lastTap.current < 300) {
      const { w, h } = size();
      const { cx, cy } = fromCentre(e.clientX, e.clientY);
      onChange(toggleZoom(value, cx, cy, w, h));
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
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinch.current != null && lastPinch.current > 0) {
        const mid = fromCentre((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        onChange(zoomAt(value, dist / lastPinch.current, mid.cx, mid.cy, w, h));
      }
      lastPinch.current = dist;
    } else if (value.scale > 1) {
      onChange(panBy(value, e.clientX - prev.x, e.clientY - prev.y, w, h));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    lastPinch.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const { w, h } = size();
    const { cx, cy } = fromCentre(e.clientX, e.clientY);
    onChange(zoomAt(value, e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy, w, h));
  }

  const t = value; // every update is already clamped by the zoomPan helpers
  return (
    <div
      ref={box}
      className={`touch-none select-none overflow-hidden ${value.scale > 1 ? 'cursor-grab' : 'cursor-zoom-in'} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
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
