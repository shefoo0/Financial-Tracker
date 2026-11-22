// Where an import starts: the file picker, the camera and the photo library. Each returns an input for the reader,
// null when the person backed out, or a message when something stopped it (e.g. the camera is not allowed).
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { ImportInput } from '@/import/read';

export type Picked = { input: ImportInput } | { cancelled: true } | { message: string };

export async function pickFile(): Promise<Picked> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset) return { cancelled: true };
    return { input: { kind: 'file', uri: asset.uri, name: asset.name, mimeType: asset.mimeType } };
  } catch {
    return { message: "Couldn't open the file picker. Try again." };
  }
}

function fromAsset(res: ImagePicker.ImagePickerResult): Picked {
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return { cancelled: true };
  return { input: { kind: 'file', uri: asset.uri, name: asset.fileName ?? 'Photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg' } };
}

export async function takePhoto(): Promise<Picked> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { message: 'The camera is not allowed. You can allow it in your phone settings, or choose a photo instead.' };
    return fromAsset(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }));
  } catch {
    return { message: "The camera couldn't be opened. Choose a photo instead." };
  }
}

export async function choosePhoto(): Promise<Picked> {
  try {
    return fromAsset(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 }));
  } catch {
    return { message: "Couldn't open your photos. Try again." };
  }
}
