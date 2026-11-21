import { normalize, sep } from "node:path";

// Keeps a server-supplied filename inside the output directory.
export function safeRelativePath(filename: string): string {
  const rel = normalize(filename.replace(/^\/?mnt\/session\/outputs\//, "")).replace(/^([/\\])+/, "");
  if (!rel || rel === "." || rel.split(/[/\\]/).includes("..")) {
    return `file-${Date.now()}`;
  }
  return rel.split("/").join(sep);
}
