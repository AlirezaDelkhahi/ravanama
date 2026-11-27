import type { BookingTrack, ServiceOffering } from "./types";

export function getTrackOfferings(
  offerings: ServiceOffering[],
  track: BookingTrack,
): ServiceOffering[] {
  return offerings.filter((o) => o.track === track);
}

export function resolveTrackOffering(
  offerings: ServiceOffering[],
  track: BookingTrack,
  selectedOfferingId: string,
): ServiceOffering | undefined {
  const trackOfferings = getTrackOfferings(offerings, track);
  if (trackOfferings.length === 0) {
    return undefined;
  }
  return (
    trackOfferings.find((o) => o.id === selectedOfferingId) ?? trackOfferings[0]
  );
}

export function canAdvanceFromStep1(
  offerings: ServiceOffering[],
  track: BookingTrack,
  selectedOfferingId: string,
): boolean {
  const trackOfferings = getTrackOfferings(offerings, track);
  return (
    trackOfferings.length > 0 &&
    Boolean(resolveTrackOffering(offerings, track, selectedOfferingId))
  );
}
