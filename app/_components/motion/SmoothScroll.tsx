'use client';

import 'lenis/dist/lenis.css';
import { ReactLenis } from 'lenis/react';

// Smooth scrolling for the member, coach and owner screens (Lenis). It eases mouse-wheel and trackpad scrolling on a laptop or tablet; a finger on a phone
// keeps the phone's own scrolling (Lenis leaves touch alone unless syncTouch is on). Lenis also turns its smoothing off for people who
// ask their device for less motion.
//
// While a sheet or dialog is open, useDialog sets overflow:hidden on <body> so the page behind does not scroll. Lenis scrolls the page
// with scrollTo(), which overflow:hidden does not stop, so it is told to leave wheel events alone while the page is locked.
// Lists that scroll on their own (a sheet's contents, the day strip) keep scrolling natively: allowNestedScroll.
const pageLocked = () => typeof document !== 'undefined' && document.body.style.overflow === 'hidden';

export function SmoothScroll() {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.12,
        allowNestedScroll: true,
        virtualScroll: () => !pageLocked(),
      }}
    />
  );
}
