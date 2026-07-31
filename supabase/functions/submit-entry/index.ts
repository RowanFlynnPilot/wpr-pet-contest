// The only path by which an anonymous visitor writes anything. Storage and
// `entries` are both closed to anon; this function holds the service role key.
//
// Photos are stored at original resolution and resized on read via Supabase
// Storage image transformations (?width=1200). No image library needed here.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { requireEnv } from "../_shared/env.ts";

const MAX_BYTES = 10 * 1024 * 1024;
// HEIC is deliberately absent. Browsers cannot display it, and iOS transcodes
// to JPEG automatically when the file input's accept attribute excludes it.
// Accepting HEIC means a large share of iPhone submissions render as broken
// images in the gallery.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const db = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const form = await req.formData();
  const photo = form.get("photo") as File;

  // Not just falsy: a text field named "photo" has no .size, and
  // `undefined > MAX_BYTES` is false, so it would slip the size check below.
  if (!(photo instanceof File)) throw new Error("photo is required");
  if (photo.size > MAX_BYTES) throw new Error(`photo exceeds ${MAX_BYTES} bytes`);
  if (!ALLOWED_TYPES.includes(photo.type)) throw new Error(`unsupported type ${photo.type}`);
  if (form.get("rights_accepted") !== "true") throw new Error("rights release must be accepted");

  const contest = await db
    .from("contests")
    .select("id, submissions_open_at, submissions_close_at")
    .eq("status", "submissions_open")
    .single()
    .then(({ data, error }) => {
      if (error) throw error;
      return data;
    });

  const now = Date.now();
  if (now < Date.parse(contest.submissions_open_at) || now > Date.parse(contest.submissions_close_at)) {
    throw new Error("submissions are closed");
  }

  const path = `${contest.id}/${crypto.randomUUID()}`;
  const upload = await db.storage.from("pets").upload(path, photo, {
    contentType: photo.type,
  });
  if (upload.error) throw upload.error;

  const insert = await db.from("entries").insert({
    contest_id: contest.id,
    pet_name: form.get("pet_name"),
    species: form.get("species"),
    owner_name: form.get("owner_name"),
    owner_email: form.get("owner_email"),
    town: form.get("town"),
    photo_path: path,
    rights_accepted_at: new Date().toISOString(),
  });
  if (insert.error) {
    // The object is already public at its URL but would have no entry row, so
    // moderation could never find it to delete. Remove it before failing.
    await db.storage.from("pets").remove([path]);
    throw insert.error;
  }

  // Deliberately no entry id in the response. Nothing is public until a human
  // approves it in the moderation queue.
  return Response.json({ received: true }, { headers: corsHeaders });
});
