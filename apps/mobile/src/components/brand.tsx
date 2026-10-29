import { Image } from 'react-native';

import { useResolvedScheme } from '@/theme';

// The Ballistic Performance logo at a given height. The full badge has a black disc and ring, which vanish on a dark background,
// so dark screens get the teal BP mark on its own and light screens get the whole badge. (Both are made from assets/brand by
// scripts/generate-brand-assets.cjs.)
const MARK_ASPECT = 411 / 271;

export function BrandMark({ height }: { height: number }) {
  const dark = useResolvedScheme() === 'dark';
  return dark ? (
    <Image source={require('../../assets/images/logo-mark.png')} style={{ width: height * MARK_ASPECT, height }} resizeMode="contain" accessibilityLabel="Ballistic Performance" accessibilityIgnoresInvertColors />
  ) : (
    <Image source={require('../../assets/images/logo-badge.png')} style={{ width: height, height }} resizeMode="contain" accessibilityLabel="Ballistic Performance" accessibilityIgnoresInvertColors />
  );
}
