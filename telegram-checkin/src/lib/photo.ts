/** The bucket's own limit, from migration 0035. */
export const MAX_BYTES = 5 * 1024 * 1024;

/**
 * How big the long edge of a stored photograph gets.
 *
 * This is a face, taken a moment ago, over mobile data, looked at later to
 * confirm who punched. A phone camera hands back four to eight megabytes at
 * twelve megapixels; none of that resolution answers the question, and all of
 * it is paid for on a field connection.
 */
export const MAX_EDGE = 1280;
export const JPEG_QUALITY = 0.8;

/**
 * The size to draw at: the long edge capped, the aspect ratio kept, and a small
 * picture left alone rather than blown up.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Re-draw a camera file as a modest JPEG.
 *
 * Falls back to the original file if anything about the canvas path fails —
 * an unreadable image, a browser that will not encode. A punch with a large
 * photograph is worth more than no punch, and the bucket's own limit is the
 * backstop.
 */
export async function downscale(file: File): Promise<Blob> {
  if (typeof document === "undefined") return file;

  try {
    // from-image bakes the EXIF rotation into the pixels. Re-encoding drops the
    // EXIF, so without this a portrait shot from an iPhone arrives sideways —
    // and stripping that metadata is itself wanted: a photograph quietly
    // carrying its own GPS, disagreeing with the coordinates on the record, is
    // a contradiction nobody would think to look for.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );

    // Re-encoding an already small picture can come out bigger than it went in.
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}
