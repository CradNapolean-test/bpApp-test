'use client';

import { useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { gsap, prefersReducedMotion } from './gsap';

// Content that rises into place when it first shows, its children one after another (stagger).
// From React Bits AnimatedContent (reactbits.dev, AnimatedContent-TS-TW), trimmed for the member app: it only plays when it mounts (a tab
// opening), so the ScrollTrigger mode, the wipe masks, scrub and "disappear" options are left out and GSAP's scroll plugin is not loaded.
// When it finishes, the inline transform and opacity are cleared, so nothing stays on the content: a transform left on an ancestor would
// make a fixed-position sheet inside it place itself wrongly.

export interface AnimatedContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onAnimationStart'> {
  children?: ReactNode;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  scale?: number;
  delay?: number;
  // Seconds between each child; 0 moves the whole block as one.
  stagger?: number;
  className?: string;
  style?: CSSProperties;
}

const AnimatedContent = ({
  children,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  scale = 1,
  delay = 0,
  stagger = 0,
  className = '',
  style,
  ...props
}: AnimatedContentProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const ctx = gsap.context(() => {
      const targets: Element[] = stagger > 0 && el.children.length ? Array.from(el.children) : [el];
      const axis = direction === 'horizontal' ? 'x' : 'y';
      const sign = reverse ? -1 : 1;

      gsap.set(el, { visibility: 'visible' });
      if (prefersReducedMotion()) return;

      gsap.fromTo(
        targets,
        { [axis]: distance * sign, scale, opacity: initialOpacity },
        {
          [axis]: 0,
          scale: 1,
          opacity: 1,
          duration,
          ease,
          delay: Math.max(delay, 0),
          stagger: stagger > 0 ? { each: stagger } : 0,
          clearProps: 'transform,opacity',
        }
      );
    }, el);

    return () => ctx.revert();
  }, [distance, direction, reverse, duration, ease, initialOpacity, scale, delay, stagger]);

  return (
    // Hidden until the effect above runs (before the first paint), so the content never flashes in its final place first.
    <div ref={ref} className={['invisible', className].filter(Boolean).join(' ')} style={style} {...props}>
      {children}
    </div>
  );
};

export default AnimatedContent;
