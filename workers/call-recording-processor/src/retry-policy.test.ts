import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRetryEligibilityFilter,
  DEFAULT_FAILED_RETRY_COOLDOWN_MS,
  getFailedRetryCutoff,
} from "./retry-policy.js";

test("failed retry cutoff persists a 15-minute cooldown by default", () => {
  const now = Date.parse("2026-09-19T12:00:00.000Z");

  assert.equal(getFailedRetryCutoff(now), "2026-09-19T11:45:00.000Z");
  assert.equal(DEFAULT_FAILED_RETRY_COOLDOWN_MS, 900_000);
});

test("failed retry cutoff accepts configuration and safely rejects invalid values", () => {
  const now = Date.parse("2026-09-19T12:00:00.000Z");

  assert.equal(getFailedRetryCutoff(now, 60_000), "2026-09-19T11:59:00.000Z");
  assert.equal(
    getFailedRetryCutoff(now, Number.NaN),
    "2026-09-19T11:45:00.000Z",
  );
  assert.equal(getFailedRetryCutoff(now, -1), "2026-09-19T11:45:00.000Z");
});

test("retry eligibility selects pending work immediately and failed work only after the cutoff", () => {
  const cutoff = "2026-09-19T11:45:00.000Z";

  assert.equal(
    buildRetryEligibilityFilter(cutoff),
    `processing_status.eq.pending,and(processing_status.eq.failed,updated_at.lte.${cutoff})`,
  );
});
