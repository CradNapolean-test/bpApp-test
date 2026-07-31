import Image from 'next/image';

// Ballistic Performance's circular badge mark (source: assets/brand/BALLISTIC_LOGO_LORES_CIRCLE_TEAL.png,
// cropped to its content bounding box -- see scripts/_tmp_process_logo.mjs history). One asset
// works at every size we use it at: full-size on the login screen it includes the ring tagline
// text; scaled down to a nav icon that text just reads as background texture.
export function Logo({
  variant = 'mark',
  size = 32,
  className = '',
}: {
  variant?: 'mark' | 'full';
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo-badge.png"
      width={size}
      height={size}
      alt={variant === 'full' ? 'Ballistic Performance' : ''}
      className={className}
      priority={variant === 'full'}
    />
  );
}
