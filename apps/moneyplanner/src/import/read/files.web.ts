// On web a picked file is a blob: or data: URL.
export async function readBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fileSize(): Promise<number | null> {
  return null;
}
