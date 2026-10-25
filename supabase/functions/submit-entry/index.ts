// The only path by which an anonymous visitor writes anything. Storage and
// `entries` are both closed to anon; this function holds the service role key.
//
// Photos are stored at original resolution (metadata stripped) and resized on
// read via Supabase Storage image transformations (?width=1200). No image
// library needed here.

import { service as db } from "../_shared/db.ts";
import { optionalEnv } from "../_shared/env.ts";
import { NEWSROOM } from "../_shared/newsroom.ts";
import { badRequest, serve } from "../_shared/http.ts";
import { extensionFor, type ImageType, sniffImageType, stripMetadata, UnreadableImage } from "../_shared/image.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { email, oneOf, optionalText, requiredText } from "../_shared/validate.ts";

const MAX_BYTES = 10 * 1024 * 1024;
// The browser's 800px copy is ~100 KB. Anything near this is not a thumbnail.
const MAX_THUMB_BYTES = 1024 * 1024;
// HEIC is deliberately absent, here and in the bucket allowlist. Browsers cannot
// display it, and iOS transcodes to JPEG automatically when the file input's
// accept attribute excludes it. Accepting HEIC means a large share of iPhone
// submissions render as broken images in the gallery.
//
// The type is read from the bytes, not from photo.type, which is whatever the
// client claims.
const STAFF_DOMAINS = (optionalEnv("STAFF_EMAIL_DOMAINS") ?? "wausaupilotandreview.com")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

function notStaff(address: string): string {
  const domain = address.split("@").pop()?.toLowerCase() ?? "";
  if (STAFF_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    throw badRequest(`${NEWSROOM.name} staff and their households can't enter this contest.`);
  }
  return address;
}

const SPECIES = ["dog", "cat", "other"] as const;

// Enough for a household with several pets; low enough that one person cannot
// flood the moderation queue. Rejected entries do not count against it.
const MAX_ENTRIES_PER_EMAIL = Number(optionalEnv("MAX_ENTRIES_PER_EMAIL") ?? 5);

serve(async (req) => {
  // A household entering several pets in an evening fits comfortably.
  await rateLimit(req, "entry", 15, 3600);

  const form = await req.formData().catch(() => {
    throw badRequest("Expected a form submission.");
  });

  // Honeypot. The field is hidden from people; bots fill it in. Answer as if
  // it worked so they have no reason to adapt.
  if (form.get("website")) return { received: true };

  // WPR staff and their households may not enter (rules, Eligibility). A
  // personal address gets past this; moderation is the real check. This only
  // stops the honest mistake of entering from a work address.

  const photo = form.get("photo");
  // Not just falsy: a text field named "photo" has no .size, and
  // `undefined > MAX_BYTES` is false, so it would slip the size check below.
  if (!(photo instanceof File)) throw badRequest("Please attach a photo of your pet.");
  if (photo.size > MAX_BYTES) throw badRequest("That photo is over 10 MB. Please choose a smaller one.");
  if (form.get("rights_accepted") !== "true") {
    throw badRequest("Please accept the photo release to enter.");
  }

  const entry = {
    pet_name: requiredText(form.get("pet_name"), "Pet name", 40),
    species: oneOf(form.get("species"), SPECIES, "Species"),
    owner_name: requiredText(form.get("owner_name"), "Your name", 80),
    owner_email: notStaff(email(form.get("owner_email"))),
    town: requiredText(form.get("town"), "Town", 60),
    caption: optionalText(form.get("caption"), "Caption", 280),
    newsletter_opt_in: form.get("newsletter_opt_in") === "true",
  };

  const original = new Uint8Array(await photo.arrayBuffer());
  const type = sniffImageType(original);
  if (!type) {
    throw badRequest(
      "Photos must be JPEG, PNG or WebP. On an iPhone, pick the photo from your library and it converts automatically.",
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = stripMetadata(original, type);
  } catch (err) {
    if (!(err instanceof UnreadableImage)) throw err;
    throw badRequest(
      "We couldn't read that photo. Please try a different one, or take a screenshot of it and upload that.",
    );
  }

  // Optional, and never trusted: checked and stripped like the original. A bad
  // one is dropped rather than failing the entry; the gallery falls back to
  // the original photo.
  const thumb = await readThumbnail(form.get("thumb"));

  // Found here only to name the storage folder. Whether submissions are still
  // open is decided again, under a lock, by insert_entry.
  const { data: contest, error: contestError } = await db
    .from("contests")
    .select("id")
    .eq("status", "submissions_open")
    .maybeSingle();
  if (contestError) throw contestError;
  if (!contest) throw badRequest("Submissions are closed.");

  const id = crypto.randomUUID();
  const path = `${contest.id}/${id}.${extensionFor(type)}`;
  const upload = await db.storage.from("pets").upload(path, bytes, UPLOAD_OPTIONS(type));
  if (upload.error) throw upload.error;

  let thumbPath: string | null = null;
  if (thumb) {
    const candidate = `${contest.id}/${id}.thumb.${extensionFor(thumb.type)}`;
    const { error } = await db.storage.from("pets").upload(candidate, thumb.bytes, UPLOAD_OPTIONS(thumb.type));
    if (error) console.warn("thumbnail upload failed; using the original", error);
    else thumbPath = candidate;
  }
  const uploaded = thumbPath ? [path, thumbPath] : [path];

  // Rechecks the window and the per-email cap while holding the contest, so an
  // entry cannot slip in while open_round is setting the field.
  const { error: insertError } = await db.rpc("insert_entry", {
    p_contest_id: contest.id,
    p_pet_name: entry.pet_name,
    p_species: entry.species,
    p_owner_name: entry.owner_name,
    p_owner_email: entry.owner_email,
    p_town: entry.town,
    p_caption: entry.caption,
    p_photo_path: path,
    p_newsletter_opt_in: entry.newsletter_opt_in,
    p_max_per_email: MAX_ENTRIES_PER_EMAIL,
    p_thumb_path: thumbPath,
  });
  if (insertError) {
    // The objects are already public at their URLs but would have no entry
    // row, so moderation could never find them to delete. Remove them first.
    await db.storage.from("pets").remove(uploaded);
    throw insertError;
  }

  // Deliberately no entry id in the response. Nothing is public until a human
  // approves it in the moderation queue.
  return { received: true };
});


// Short cache on purpose. Without Smart CDN a deleted object keeps being served
// from the edge until its cache expires, and a rejected photo must stop
// loading soon after rejection, not in a year.
function UPLOAD_OPTIONS(type: ImageType) {
  return { contentType: type, cacheControl: "3600" };
}

async function readThumbnail(value: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; type: ImageType } | null> {
  if (!(value instanceof File) || value.size === 0 || value.size > MAX_THUMB_BYTES) return null;
  const raw = new Uint8Array(await value.arrayBuffer());
  const type = sniffImageType(raw);
  if (!type) return null;
  try {
    return { bytes: stripMetadata(raw, type), type };
  } catch {
    return null;
  }
}
