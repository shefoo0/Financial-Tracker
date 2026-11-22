// Reads a picked file as bytes (native).
import { File } from 'expo-file-system';

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** File size in bytes, or null when it cannot be known before reading. */
export async function fileSize(uri: string): Promise<number | null> {
  try {
    const s = new File(uri).size;
    return typeof s === 'number' ? s : null;
  } catch {
    return null;
  }
}
