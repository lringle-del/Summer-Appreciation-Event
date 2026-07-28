import { put, get } from '@vercel/blob';

// Small JSON helpers over a PRIVATE Vercel Blob store (token from BLOB_READ_WRITE_TOKEN).
export async function readJSON(pathname, fallback) {
  try {
    const r = await get(pathname, { access: 'private', useCache: false });
    if (!r || !r.stream) return fallback;
    const text = await new Response(r.stream).text();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function writeJSON(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
