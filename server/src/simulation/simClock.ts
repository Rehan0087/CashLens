// The demo runs against a frozen simulated clock: today at 16:00 local time,
// i.e. the afternoon peak the challenge brief describes. Seeding stamps this
// into sim_meta; every projection, staleness check, and alert timestamp uses it.
export const OPEN_HOUR = 8; // agents open at 08:00
export const SIM_HOUR = 16; // "now" is 16:00 — 8 observed business hours

export function computeSimNow(): Date {
  const d = new Date();
  d.setHours(SIM_HOUR, 0, 0, 0);
  return d;
}
