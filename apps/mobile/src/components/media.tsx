import { Image } from 'expo-image';
import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

// A photo filling the screen on black. Tap anywhere to close.
export function PhotoViewer({ src, caption, onClose }: { src: string | null; caption?: string; onClose: () => void }) {
  if (!src) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: spacing.md }}>
        <Image source={{ uri: src }} style={{ width: '100%', height: '85%' }} contentFit="contain" loading="eager" />
        <AppText variant="small" style={{ color: '#fff', textAlign: 'center', marginTop: spacing.sm, opacity: 0.8 }}>
          {caption ? `${caption} · tap anywhere to close` : 'Tap anywhere to close'}
        </AppText>
      </Pressable>
    </Modal>
  );
}

// Where the photo comes from: a small sheet from the bottom with Take a photo / Choose from library / Cancel.
export function PhotoSourceMenu({ onPick, onClose }: { onPick: (source: 'camera' | 'library') => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.card, padding: spacing.md, gap: spacing.sm, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
          <MenuRow label="Take a photo" onPress={() => onPick('camera')} />
          <MenuRow label="Choose from library" onPress={() => onPick('library')} />
          <MenuRow label="Cancel" muted onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuRow({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: t.cardMuted, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
      <AppText style={{ fontWeight: '600', color: muted ? t.muted : t.foreground }}>{label}</AppText>
    </Pressable>
  );
}
