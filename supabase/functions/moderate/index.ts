// Approve or reject an entry, as the signed-in moderator.
//
// Rejection deletes the photo here, server-side, in the same request. The
// bucket is public: a rejected photo stays fetchable at its UUID URL until the
// object is gone, so this cannot be left to whichever admin UI remembers to do
// it. If the delete fails, rejected_photos_live lists the entry and
// decision "purge" retries it.

import { requireAdmin, service } from "../_shared/db.ts";
import { emailEnabled } from "../_shared/email.ts";
import { HttpError, readJson, serve } from "../_shared/http.ts";
import { sweep } from "../_shared/notify.ts";
import { oneOf, optionalText, uuid } from "../_shared/validate.ts";

serve(async (req) => {
  const staff = await requireAdmin(req);
  const body = await readJson(req);
  const entryId = uuid(body.entry_id, "Entry");
  const decision = oneOf(body.decision, ["approve", "reject", "purge"] as const, "Decision");

  if (decision === "purge") {
    // Read through the moderator's session: RLS confirms they may see it.
    const { data, error } = await staff
      .from("entries").select("status").eq("id", entryId).single();
    if (error) throw error;
    if (data.status !== "rejected" && data.status !== "disqualified") {
      throw new HttpError(400, "Only a rejected or disqualified entry's photo can be purged.");
    }
  } else {
    const { error } = await staff.rpc("moderate_entry", {
      p_entry_id: entryId,
      p_approve: decision === "approve",
      p_reason: optionalText(body.reason, "Reason", 200),
    });
    if (error) throw error;
  }

  // The photo and its thumbnail, both public until deleted.
  let photoDeleted = false;
  if (decision !== "approve") {
    const { data: files, error: readError } = await service
      .from("entries").select("photo_path, thumb_path").eq("id", entryId).single();
    if (readError) throw readError;
    const paths = [files.photo_path, files.thumb_path].filter(Boolean) as string[];
    const { error } = await service.storage.from("pets").remove(paths);
    if (error) console.error("photo delete failed", entryId, paths, error);
    else photoDeleted = true;
  }

  // Best effort: the approval email (with the share link) goes out now rather
  // than on the next sweep. A mail failure never undoes a moderation decision.
  let notified = 0;
  if (emailEnabled && decision !== "purge") {
    try {
      notified = (await sweep(10)).sent;
    } catch (err) {
      console.error("notify after moderation failed", err);
    }
  }

  return { ok: true, photo_deleted: photoDeleted, notified };
});
