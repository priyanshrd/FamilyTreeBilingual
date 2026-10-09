// Profile photos. Images are resized in the browser before upload (quick on mobile data, small
// storage): a photo of at most 1024px and a square 192px thumbnail for the tree, both WebP.
// Binaries live in the private `family-media` bucket; rows in media / media_links point to them.
import { useQuery } from '@tanstack/react-query';
import type { PersonView } from '@/domain/family/familyModel';
import { supabase } from '@/services/supabase';

const BUCKET = 'family-media';
const FULL = 1024;
const THUMB = 192;
const URL_TTL = 60 * 60; // seconds

async function draw(file: Blob, size: (w: number, h: number) => { sx: number; sy: number; sw: number; sh: number; w: number; h: number }) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const r = size(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85));
  if (!blob) throw new Error('Could not read this picture');
  return { blob, width: r.w, height: r.h };
}

export async function resizePhoto(file: Blob) {
  const full = await draw(file, (w, h) => {
    const k = Math.min(1, FULL / Math.max(w, h));
    return { sx: 0, sy: 0, sw: w, sh: h, w: Math.round(w * k), h: Math.round(h * k) };
  });
  // square, centred horizontally, nearer the top vertically (faces are usually in the upper part)
  const thumb = await draw(file, (w, h) => {
    const s = Math.min(w, h);
    return { sx: (w - s) / 2, sy: (h - s) / 4, sw: s, sh: s, w: Math.min(THUMB, s), h: Math.min(THUMB, s) };
  });
  return { full, thumb };
}

/** Upload a new profile photo for a person, replacing the current one. */
export async function setProfilePhoto(familyId: string, person: PersonView, file: Blob): Promise<void> {
  const { full, thumb } = await resizePhoto(file);
  const mediaId = crypto.randomUUID();
  const base = `${familyId}/people/${person.id}/${mediaId}`;
  const storage = supabase.storage.from(BUCKET);
  for (const [path, blob] of [
    [`${base}.webp`, full.blob],
    [`${base}_thumb.webp`, thumb.blob],
  ] as const) {
    const { error } = await storage.upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw error;
  }
  await removeProfilePhoto(person);
  const { error: mediaError } = await supabase.from('media').insert({
    id: mediaId,
    family_id: familyId,
    kind: 'photo',
    storage_path: `${base}.webp`,
    thumb_path: `${base}_thumb.webp`,
    mime_type: 'image/webp',
    size_bytes: full.blob.size,
    width: full.width,
    height: full.height,
  });
  if (mediaError) throw mediaError;
  const { error: linkError } = await supabase.from('media_links').insert({ family_id: familyId, media_id: mediaId, person_id: person.id, role: 'profile' });
  if (linkError) throw linkError;
}

/** Take the profile photo off a person (the file is kept, so the change can be undone). */
export async function removeProfilePhoto(person: PersonView): Promise<void> {
  if (!person.photo) return;
  const { error } = await supabase.from('media_links').delete().eq('person_id', person.id).eq('role', 'profile');
  if (error) throw error;
  const { error: mediaError } = await supabase.from('media').update({ deleted_at: new Date().toISOString() }).eq('id', person.photo.mediaId);
  if (mediaError) throw mediaError;
}

/** Temporary links for showing private photos, refreshed before they expire. */
export function usePhotoUrls(paths: string[]): Map<string, string> {
  const sorted = [...new Set(paths)].sort();
  const q = useQuery({
    queryKey: ['photoUrls', sorted],
    enabled: sorted.length > 0,
    staleTime: (URL_TTL - 300) * 1000,
    refetchInterval: (URL_TTL - 300) * 1000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(sorted, URL_TTL);
      if (error) throw error;
      return new Map(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
    },
  });
  return q.data ?? new Map();
}
