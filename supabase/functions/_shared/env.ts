// `Deno.env.get("X")!` is a TypeScript assertion, not a runtime check. If the
// secret is missing, the `!` silences the compiler and `undefined` sails on
// through — surfacing much later as a confusing Supabase auth failure, or as a
// literal `Access-Control-Allow-Origin: undefined` header that no log explains.
//
// Fail at module load instead, naming the variable that is missing.

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}
