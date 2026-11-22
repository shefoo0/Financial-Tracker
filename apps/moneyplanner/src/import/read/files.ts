// Reads a picked file as bytes (native).
import { File } from 'expo-file-system';

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
