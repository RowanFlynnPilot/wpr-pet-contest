// Request plumbing for the browser-facing functions.
//
// The 0003-era functions threw on bad input. Deno turns an uncaught throw into
// a bare 500 with no CORS headers, so the browser reported a CORS failure and
// the reader saw "something went wrong" for what was really "that photo is too
// big". Every error now leaves as JSON, with CORS headers, and with a message
// written for the person who has to act on it.

import { corsHeaders } from "./cors.ts";
import { badRequest, HttpError } from "./http_error.ts";

export { badRequest, HttpError };

// Raised by the database for the reader (vote_quote, moderate_entry). Anything
// else from Postgres is an internal error and is not shown verbatim.
const READER_FACING_SQLSTATE = "WP400";

type Handler = (req: Request) => Promise<Response | Record<string, unknown>>;

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

export function serve(handler: Handler): void {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

    try {
      const out = await handler(req);
      return out instanceof Response ? out : json(out, 200, cors);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status, cors);
      }
      if (isReaderFacing(err)) {
        return json({ error: (err as { message: string }).message }, 400, cors);
      }
      console.error(err);
      return json({ error: "Something went wrong on our end. Please try again in a minute." }, 500, cors);
    }
  });
}

function isReaderFacing(err: unknown): boolean {
  return typeof err === "object" && err !== null &&
    (err as { code?: string }).code === READER_FACING_SQLSTATE;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body;
  } catch {
    // fall through
  }
  throw badRequest("Expected a JSON object.");
}
