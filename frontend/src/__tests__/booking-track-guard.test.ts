import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  canAdvanceFromStep1,
  getTrackOfferings,
  resolveTrackOffering,
} from "../lib/booking-selection";
import type { ServiceOffering } from "../lib/types";

const iranOnlyOfferings: ServiceOffering[] = [
  {
    id: "off-iran-1",
    title: "مشاوره فردی",
    description: "جلسه ۵۰ دقیقه‌ای",
    track: "iran",
    durationMinutes: 50,
    priceAmount: 950000,
    currency: "IRT",
  },
];

const dualTrackOfferings: ServiceOffering[] = [
  ...iranOnlyOfferings,
  {
    id: "off-abroad-1",
    title: "Individual Session",
    description: "50-minute online session",
    track: "abroad",
    durationMinutes: 50,
    priceAmount: 6500,
    currency: "EUR",
  },
];

test("resolveTrackOffering never falls back across tracks when selected track has zero offerings", () => {
  assert.equal(getTrackOfferings(iranOnlyOfferings, "abroad").length, 0);
  assert.equal(
    resolveTrackOffering(iranOnlyOfferings, "abroad", "off-iran-1"),
    undefined,
  );
  assert.equal(
    resolveTrackOffering(iranOnlyOfferings, "abroad", ""),
    undefined,
  );
  assert.equal(
    canAdvanceFromStep1(iranOnlyOfferings, "abroad", "off-iran-1"),
    false,
  );
});

test("resolveTrackOffering selects strictly within active track and allows Step 1 advance only with track offering", () => {
  const iranSelected = resolveTrackOffering(
    dualTrackOfferings,
    "iran",
    "off-abroad-1",
  );
  assert.equal(iranSelected?.id, "off-iran-1");
  assert.equal(
    canAdvanceFromStep1(dualTrackOfferings, "iran", "off-abroad-1"),
    true,
  );

  const abroadSelected = resolveTrackOffering(
    dualTrackOfferings,
    "abroad",
    "off-abroad-1",
  );
  assert.equal(abroadSelected?.id, "off-abroad-1");
  assert.equal(
    canAdvanceFromStep1(dualTrackOfferings, "abroad", "off-abroad-1"),
    true,
  );
});

test("BookingWizard guards Step 1 CTAs with track-specific offering check", () => {
  const wizardSrc = readFileSync(
    resolve(process.cwd(), "src/components/booking/BookingWizard.tsx"),
    "utf8",
  );
  assert.equal(wizardSrc.includes("therapist.offerings[0]"), false);
  assert.ok(wizardSrc.includes("handleContinueToStep2"));
  assert.ok(wizardSrc.includes("trackOfferings.length === 0"));
});
