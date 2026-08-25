import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadRoot } from '../config/upload.js';

export function resolveStoredFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  const relativePath = filePath.replace(/^uploads[\\/]/, '');
  const resolvedPath = path.resolve(uploadRoot, relativePath);
  const rootWithSeparator = `${path.resolve(uploadRoot)}${path.sep}`;
  if (!resolvedPath.startsWith(rootWithSeparator)) return null;
  return resolvedPath;
}

export async function deleteFileIfExists(filePath) {
  const resolvedPath = resolveStoredFile(filePath);
  if (!resolvedPath) return false;
  try {
    await fs.unlink(resolvedPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
