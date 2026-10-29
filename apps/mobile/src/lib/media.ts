import { useQuery } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { SIGNED_URL_SECONDS, shrinkTarget } from '@ballistic/shared/utils/chat';

import { supabase } from '@/lib/supabase';

// The private buckets the app reads and writes. Every path starts with the member's own user id, which is what the
// storage policies check.
export type Bucket = 'chat-photos' | 'voice-notes' | 'progress-photos' | 'inbody-scans' | 'food-photos';

// A short-lived link to a private file; the storage policies decide whether this member may have one.
export async function signedUrlFor(bucket: Bucket, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw error ?? new Error('Could not open that file');
  return data.signedUrl;
}

// The same link as a hook. Held in memory only (never saved to the device cache), and made only when something on
// screen actually needs it.
export function useSignedUrl(bucket: Bucket, path: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['signed', bucket, path],
    enabled: enabled && !!path,
    staleTime: (SIGNED_URL_SECONDS - 120) * 1000,
    gcTime: SIGNED_URL_SECONDS * 1000,
    queryFn: () => signedUrlFor(bucket, path!),
  });
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Could not read that file');
  return res.arrayBuffer();
}

export async function uploadFile(bucket: Bucket, path: string, uri: string, contentType: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, await readBytes(uri), { contentType });
  if (error) throw error;
}

export async function removeFiles(bucket: Bucket, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}

// Phone photos are several MB: shrink to 1600 on the longer edge as JPEG before upload (same as the web).
export async function shrinkPhoto(asset: { uri: string; width: number; height: number }): Promise<string> {
  let { width, height } = asset;
  if (!width || !height) {
    const probe = await ImageManipulator.manipulate(asset.uri).renderAsync(); // some pickers do not report a size
    width = probe.width;
    height = probe.height;
  }
  const context = ImageManipulator.manipulate(asset.uri);
  const target = shrinkTarget(width, height);
  if (target) context.resize(width >= height ? { width: target.width } : { height: target.height });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return saved.uri;
}

export type PickedPhoto = { uri: string; width: number; height: number };

// Thrown when the member said no to the camera, so the screen can say what to do about it.
export class PhotoPermissionError extends Error {}

// The camera or the photo library. Resolves to null when the member backs out.
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PhotoPermissionError('Allow camera access in your settings to take a photo.');
  }
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (res.canceled) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}
