import { Pressable as NativePressable, type PressableProps } from 'react-native';

// The app's Pressable: the same as React Native's, but whatever is tapped dims a little while the finger is on it, so the member
// can see the tap landed. Pass your own style function to do something different (Button and ListRow do); overlay backdrops
// that must not dim use React Native's Pressable directly. Anything with an onPress is announced as a button to a screen reader
// unless the caller gives another role (a link, a radio, an image button).
export function Pressable({ style, disabled, accessibilityRole, onPress, ...rest }: PressableProps) {
  return (
    <NativePressable
      {...rest}
      onPress={onPress}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      disabled={disabled}
      style={(state) => [typeof style === 'function' ? style(state) : style, state.pressed && !disabled ? { opacity: 0.7 } : null]}
    />
  );
}
