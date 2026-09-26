// Kept apart from http.ts, which pulls in cors.ts and therefore needs
// ALLOWED_ORIGIN at load. Pure modules (and their tests) import this instead.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
