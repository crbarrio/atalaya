/**
 * The reason out of a failed HTTP call, as Nest puts it in the body.
 *
 * Was copied verbatim into three components before a fourth wanted it. The
 * copies were identical, so this is a move rather than a merge.
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error) {
    const body = (error as { error?: { message?: string } }).error;
    if (body?.message) return body.message;
  }
  return 'Something went wrong.';
}
