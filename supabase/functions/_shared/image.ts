// Photo checks for submit-entry. Pure byte handling, no image library.
//
// Two jobs:
//
// 1. Decide the type from the bytes. `File.type` is whatever the client says;
//    the bucket's MIME allowlist trusts that header too. A renamed HEIC or a
//    script with a .jpg name is caught here instead.
//
// 2. Strip metadata. The bucket is public and serves originals, and phone
//    photos carry GPS coordinates in EXIF: for most entrants, the location of
//    their house. The front end re-encodes through a canvas, which already drops
//    it, but the server cannot assume the front end ran.
//
//    The one EXIF field kept is Orientation. Phones store portrait shots as
//    landscape pixels plus an orientation flag; drop the flag and every portrait
//    photo in the gallery turns on its side.

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export function extensionFor(type: ImageType): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
}

export class UnreadableImage extends Error {}

// Returns the stripped bytes. Throws UnreadableImage when the file does not
// parse the way its format says it should: failing closed, because "could not
// parse, stored as-is" is exactly how GPS gets through. The front end's canvas
// re-encode produces files this parses, so in practice only a file that
// skipped the front end can be refused here.
export function stripMetadata(bytes: Uint8Array, type: ImageType): Uint8Array {
  try {
    if (type === "image/jpeg") return stripJpeg(bytes);
    if (type === "image/png") return stripPng(bytes);
    return stripWebp(bytes);
  } catch (err) {
    throw new UnreadableImage(String(err));
  }
}


// -------------------------------------------------------------------- JPEG --
// A full walk: SOI, marker segments, and for each scan (progressive files have
// several, with tables between them) the entropy-coded data up to the next real
// marker. Stops at the primary image's EOI and drops everything after it. That
// trailer is where phones put MPF secondary images, each with its own EXIF, and
// motion-photo video, whose metadata can carry location.
//
// Kept: APP0 (JFIF), APP2 when it is an ICC color profile (dropping it shifts
// colors), APP14 (Adobe, needed to decode CMYK). Dropped: every other APPn
// (EXIF, XMP, MPF, Photoshop/IPTC, vendor blocks) and COM.
function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === 0xfe) return false;
  if (marker < 0xe0 || marker > 0xef) return true;
  if (marker === 0xe0 || marker === 0xee) return true;
  if (marker === 0xe2) return ascii(payload, 0, 12) === "ICC_PROFILE\0";
  return false;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let orientation: number | null = null;
  let sawScan = false;
  let i = 2;

  const finish = () => {
    if (!sawScan) throw new Error("no image data");
    // After APP0 when there is one: JFIF readers expect APP0 first.
    const at = out[1]?.[1] === 0xe0 ? 2 : 1;
    if (orientation !== null) out.splice(at, 0, orientationApp1(orientation));
    out.push(new Uint8Array([0xff, 0xd9]));
    return concat(out);
  };

  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("expected marker");
    // Fill bytes: any number of 0xFF may precede a marker.
    while (b[i + 1] === 0xff) i++;
    const marker = b[i + 1];
    if (marker === undefined) throw new Error("truncated marker");

    if (marker === 0xd9) return finish();

    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const length = (b[i + 2] << 8) | b[i + 3];
    if (!(length >= 2) || i + 2 + length > b.length) throw new Error("bad segment length");
    const payload = b.subarray(i + 4, i + 2 + length);

    if (marker === 0xe1 && orientation === null) orientation = readExifOrientation(payload);
    if (keepJpegSegment(marker, payload)) out.push(b.subarray(i, i + 2 + length));
    i += 2 + length;

    if (marker === 0xda) {
      // Entropy-coded data: 0xFF is always followed by 0x00 (a stuffed byte)
      // or a restart marker. Anything else is the next real marker.
      sawScan = true;
      let j = i;
      while (j < b.length) {
        if (b[j] === 0xff && j + 1 < b.length) {
          const next = b[j + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out.push(b.subarray(i, j));
      i = j;
      // A file that simply ends mid-scan (some cameras omit EOI) gets one.
      if (i >= b.length) return finish();
    }
  }
  return finish();
}

// Orientation (tag 0x0112) from IFD0 of an APP1 "Exif\0\0" payload.
function readExifOrientation(p: Uint8Array): number | null {
  if (ascii(p, 0, 4) !== "Exif") return null;
  const t = p.subarray(6);
  const little = t[0] === 0x49; // "II" little-endian, "MM" big-endian
  const u16 = (o: number) => little ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1];
  const u32 = (o: number) =>
    little
      ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0
      : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0;

  const ifd = u32(4);
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > t.length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

// A minimal APP1 holding nothing but Orientation. Big-endian TIFF, one IFD
// entry, no next IFD.
function orientationApp1(orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, count 1
    0x00, orientation, 0x00, 0x00, // value, padded to 4 bytes
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}


// --------------------------------------------------------------------- PNG --
// Chunks: length, type, data, CRC. eXIf holds EXIF; the three text chunk types
// can hold XMP, which can hold GPS. Everything else is kept verbatim, CRCs and
// all, since nothing kept is modified.
const DROP_PNG = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function stripPng(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i < b.length) {
    const length = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + length;
    if (end > b.length) throw new Error("bad chunk length");
    if (!DROP_PNG.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(out);
  }
  throw new Error("no IEND");
}


// -------------------------------------------------------------------- WebP --
// RIFF container. EXIF and "XMP " chunks are dropped, their flag bits in the
// VP8X header cleared, and the RIFF size rewritten.
function stripWebp(b: Uint8Array): Uint8Array {
  const u32 = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  // Only what the RIFF header claims. Bytes after it are a trailer, and a
  // trailer is where metadata hides.
  const limit = 8 + u32(4);
  if (limit > b.length) throw new Error("truncated RIFF");

  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i < limit) {
    if (i + 8 > limit) throw new Error("truncated chunk header");
    const fourcc = ascii(b, i, 4);
    const size = u32(i + 4);
    if (i + 8 + size > limit) throw new Error("bad chunk size");
    const end = Math.min(i + 8 + size + (size & 1), limit);
    const chunk = b.slice(i, end);
    if (fourcc === "VP8X") chunk[8] &= ~(0x08 | 0x04); // EXIF and XMP flags
    if (fourcc !== "EXIF" && fourcc !== "XMP ") chunks.push(chunk);
    i = end;
  }
  const body = concat(chunks);
  const riffSize = body.length + 4;
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    riffSize & 0xff, (riffSize >> 8) & 0xff, (riffSize >> 16) & 0xff, (riffSize >> 24) & 0xff,
    0x57, 0x45, 0x42, 0x50,
  ]);
  return concat([header, body]);
}


// ----------------------------------------------------------------- helpers --
function ascii(b: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...b.subarray(start, start + length));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
