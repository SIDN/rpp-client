import { describe, expect, it } from "vitest";
import { buildRawRequest } from "./rawRequest";
import { REQUEST_SAMPLES } from "./requestSamples";

describe("request samples", () => {
  it("have unique identifiers", () => {
    const ids = REQUEST_SAMPLES.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("can all be sent as they are", () => {
    for (const sample of REQUEST_SAMPLES) {
      const result = buildRawRequest({
        method: sample.method,
        target: sample.target,
        query: sample.query ?? "",
        headers: sample.headers ?? "",
        body: sample.body === undefined ? "" : JSON.stringify(sample.body),
        clientTransactionId: "",
        authenticate: true,
        setStandardHeaders: false,
        standardHeaders: "",
      });
      expect(result, sample.id).toMatchObject({ ok: true });
    }
  });
});
