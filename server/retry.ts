export interface RetryableProviderError extends Error {
  statusCode?: number;
}

// Reject independently of SDK cooperation, while consuming late promise settlements.
export function withinDeadline<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Deadline expired", "TimeoutError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }).then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) abort();
      else resolve(value);
    }, error => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
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
      return await withinDeadline(() => operation(attemptSignal, attempt), attemptSignal);
    } catch (error) {
      lastError = error;
      if (overallSignal.aborted) throw overallSignal.reason ?? error;
      if (attempt === 2 || !isTransientProviderError(error)) throw error;
      if (providerStatus(error) === 429) {
        await withinDeadline(() => new Promise(resolve => setTimeout(resolve, 150)), overallSignal);
      }
    }
  }

  throw lastError;
}
