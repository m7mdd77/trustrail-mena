export interface RetryableProviderError extends Error {
  statusCode?: number;
}

export function providerStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const status = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isInteger(status)) return status;
  }

  const message = error instanceof Error ? error.message : "";
  const match = message.match(/Status code:\s*(\d{3})/i);
  return match ? Number(match[1]) : undefined;
}

export function isTransientProviderError(error: unknown): boolean {
  const status = providerStatus(error);
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || /timed?\s*out|timeout/i.test(error.message);
}

export async function executeWithOneTransientRetry<T>(
  operation: (signal: AbortSignal, attempt: number) => Promise<T>,
  overallSignal: AbortSignal,
  attemptTimeoutMs: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (overallSignal.aborted) throw overallSignal.reason ?? new Error("Decision budget expired");
    const attemptSignal = AbortSignal.any([overallSignal, AbortSignal.timeout(attemptTimeoutMs)]);

    try {
      return await operation(attemptSignal, attempt);
    } catch (error) {
      lastError = error;
      if (overallSignal.aborted) throw overallSignal.reason ?? error;
      if (attempt === 2 || !isTransientProviderError(error)) throw error;
    }
  }

  throw lastError;
}
