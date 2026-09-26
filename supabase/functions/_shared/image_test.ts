// deno test --allow-env --allow-read supabase/functions/_shared
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { sniffImageType, stripMetadata, UnreadableImage } from "./image.ts";

const enc = (s: string) => [...new TextEncoder().encode(s)];
const has = (hay: Uint8Array, needle: number[]) =>
  hay.some((_, i) => needle.every((b, j) => hay[i + j] === b));

function segment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}

// An EXIF APP1 with Orientation and a stand-in for GPS data.
function exif(orientation: number, little = false): number[] {
  const u16 = (n: number) => little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff];
  const u32 = (n: number) => little ? [n & 0xff, (n >> 8) & 0xff, 0, 0] : [0, 0, (n >> 8) & 0xff, n & 0xff];
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
    ...u16(2),
    ...u16(0x010f), ...u16(2), ...u32(4), ...enc("Cam\0"), // Make
    ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
    ...u32(0),
    ...enc("GPS 44.9591N 89.6301W"),
  ];
  return segment(0xe1, [...enc("Exif\0\0"), ...tiff]);
}

const JFIF = segment(0xe0, [...enc("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const SOS_AND_DATA = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9];

Deno.test("sniffs types from bytes, not names", () => {
  assertEquals(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assertEquals(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assertEquals(sniffImageType(new Uint8Array([...enc("RIFF"), 0, 0, 0, 0, ...enc("WEBP")])), "image/webp");
  // HEIC is an ISO box file: "....ftypheic". Refused.
  assertEquals(sniffImageType(new Uint8Array([0, 0, 0, 0x18, ...enc("ftypheic")])), null);
  assertEquals(sniffImageType(new Uint8Array(enc("<script>"))), null);
});

Deno.test("JPEG: GPS is gone, orientation survives", () => {
  const input = new Uint8Array([0xff, 0xd8, ...JFIF, ...exif(6), ...segment(0xfe, enc("comment")), ...SOS_AND_DATA]);
  const out = stripMetadata(input, "image/jpeg");

  assert(!has(out, enc("GPS 44.9591N")), "GPS text removed");
  assert(!has(out, enc("comment")), "COM segment removed");
  assert(has(out, enc("JFIF")), "APP0 kept");
  assert(has(out, [0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06]), "orientation 6 rewritten");
  assertEquals([...out.subarray(out.length - 9)], SOS_AND_DATA, "image data untouched");
  // The rebuilt APP1 sits after APP0.
  assertEquals(out[2 + JFIF.length + 1], 0xe1);
});

Deno.test("JPEG: little-endian EXIF orientation is read", () => {
  const input = new Uint8Array([0xff, 0xd8, ...exif(8, true), ...SOS_AND_DATA]);
  const out = stripMetadata(input, "image/jpeg");
  assert(has(out, [0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08]));
  assert(!has(out, enc("Cam")));
});

Deno.test("JPEG: no EXIF means no invented APP1", () => {
  const input = new Uint8Array([0xff, 0xd8, ...JFIF, ...SOS_AND_DATA]);
  assertEquals(stripMetadata(input, "image/jpeg"), input);
});

Deno.test("JPEG: a file that does not parse is refused, never stored as-is", () => {
  const bad = [
    [0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00], // segment runs past the end
    [0xff, 0xd8, ...exif(6), 0x42, ...SOS_AND_DATA], // stray byte between segments
    [0xff, 0xd8, ...JFIF, 0xff, 0xd9], // no scan at all
  ];
  for (const b of bad) {
    assertThrows(() => stripMetadata(new Uint8Array(b), "image/jpeg"), UnreadableImage);
  }
});

Deno.test("JPEG: everything after the primary image is dropped", () => {
  // A motion photo: the primary JPEG, then an MP4 whose metadata has location,
  // then an MPF secondary image with its own EXIF.
  const trailer = [...enc("ftypmp42 ©xyz+44.9591-089.6301/"), 0xff, 0xd8, ...exif(1), ...SOS_AND_DATA];
  const mpf = segment(0xe2, [...enc("MPF\0"), 1, 2, 3, 4]);
  const input = new Uint8Array([0xff, 0xd8, ...JFIF, ...mpf, ...SOS_AND_DATA, ...trailer]);
  const out = stripMetadata(input, "image/jpeg");

  assert(!has(out, enc("+44.9591")), "motion-photo location gone");
  assert(!has(out, enc("MPF")), "MPF index gone");
  assertEquals([...out.subarray(out.length - 2)], [0xff, 0xd9], "ends at the primary EOI");
});

Deno.test("JPEG: progressive scans, restart markers and ICC survive", () => {
  const icc = segment(0xe2, [...enc("ICC_PROFILE\0"), 1, 1, 7, 7]);
  const dht = segment(0xc4, [0x00, 0xff, 0xd9, 0x01]); // table bytes that look like EOI
  const scan1 = [0xff, 0xda, 0x00, 0x02, 0x10, 0xff, 0x00, 0x11, 0xff, 0xd0, 0x12];
  const scan2 = [0xff, 0xda, 0x00, 0x02, 0x20, 0x21];
  const input = new Uint8Array([0xff, 0xd8, ...icc, ...scan1, ...dht, ...scan2, 0xff, 0xd9]);
  assertEquals(stripMetadata(input, "image/jpeg"), input);
});

Deno.test("JPEG: a file that ends mid-scan is closed with an EOI", () => {
  const input = new Uint8Array([0xff, 0xd8, ...JFIF, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22]);
  const out = stripMetadata(input, "image/jpeg");
  assertEquals([...out.subarray(out.length - 4)], [0x11, 0x22, 0xff, 0xd9]);
});

function pngChunk(type: string, data: number[]): number[] {
  const n = data.length;
  return [n >> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, ...enc(type), ...data, 0, 0, 0, 0];
}

Deno.test("PNG: text and eXIf chunks are dropped, pixels kept", () => {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const input = new Uint8Array([
    ...sig,
    ...pngChunk("IHDR", Array(13).fill(1)),
    ...pngChunk("tEXt", enc("GPS\0here")),
    ...pngChunk("eXIf", enc("MM\0*secret")),
    ...pngChunk("IDAT", [9, 9, 9]),
    ...pngChunk("IEND", []),
  ]);
  const out = stripMetadata(input, "image/png");
  assert(!has(out, enc("tEXt")) && !has(out, enc("eXIf")));
  assert(has(out, enc("IHDR")) && has(out, enc("IDAT")) && has(out, enc("IEND")));
});

function riffChunk(fourcc: string, data: number[]): number[] {
  const n = data.length;
  return [...enc(fourcc), n & 0xff, (n >> 8) & 0xff, 0, 0, ...data, ...(n & 1 ? [0] : [])];
}

Deno.test("WebP: EXIF and XMP chunks dropped, flags cleared, size rewritten", () => {
  const body = [
    ...riffChunk("VP8X", [0x08 | 0x04 | 0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
    ...riffChunk("VP8 ", [1, 2, 3]),
    ...riffChunk("EXIF", enc("GPS")),
    ...riffChunk("XMP ", enc("<x/>")),
  ];
  const size = body.length + 4;
  // Bytes past the RIFF size are a trailer and must not survive either.
  const input = new Uint8Array([...enc("RIFF"), size & 0xff, size >> 8, 0, 0, ...enc("WEBP"), ...body, ...enc("GPS-TRAILER")]);
  const out = stripMetadata(input, "image/webp");

  assert(!has(out, enc("EXIF")) && !has(out, enc("XMP ")) && !has(out, enc("GPS-TRAILER")));
  assertEquals(out[20], 0x10, "alpha flag kept, EXIF and XMP flags cleared");
  const riff = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
  assertEquals(riff, out.length - 8);
});
