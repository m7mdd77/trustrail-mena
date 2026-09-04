import { describe, expect, it, vi } from "vitest";
import { executeWithOneTransientRetry } from "../server/retry.js";

function providerError(statusCode: number) {
  return Object.assign(new Error(`Status code: ${statusCode}`), { statusCode });
}

describe("Nokia retry policy", () => {
  it("retries one transient 5XX once", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(providerError(503))
      .mockResolvedValueOnce({ ok: true });

    await expect(
      executeWithOneTransientRetry(operation, new AbortController().signal, 500),
    ).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient 4XX", async () => {
    const operation = vi.fn().mockRejectedValue(providerError(422));

    await expect(
      executeWithOneTransientRetry(operation, new AbortController().signal, 500),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
