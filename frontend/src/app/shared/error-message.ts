/**
 * The reason out of a failed HTTP call, as Nest puts it in the body.
 *
 * Three components carry their own copy of this; this is the shared one, and
 * they should move onto it rather than a fourth appearing.
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const body = (error as { error?: { message?: string } }).error;
    if (body?.message) return body.message;
  }
  return 'Something went wrong.';
}
