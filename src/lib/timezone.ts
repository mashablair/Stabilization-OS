/**
 * Timezone utility
 *
 * `todayDateStr()` returns today's calendar date (YYYY-MM-DD) in the user's
 * configured IANA timezone. Call `setActiveTimezone(tz)` as soon as the user's
 * settings are loaded from the database. Until then, the browser's own timezone
 * is used as the default — so first-render is always correct for local users
 * and only needs the saved setting for users whose app timezone differs from
 * their current browser timezone (e.g., someone who travels).
 */

let _tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function getActiveTimezone(): string {
  return _tz;
}

export function setActiveTimezone(tz: string): void {
  if (!tz) return;
  try {
    // Validate by attempting to format — throws RangeError for unknown zones.
    Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    _tz = tz;
  } catch {
    console.warn(`[timezone] Unknown timezone "${tz}", keeping "${_tz}"`);
  }
}

/** Today's calendar date as YYYY-MM-DD in the user's configured timezone. */
export function todayDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: _tz }).format(new Date());
}

/**
 * Format any Date object as YYYY-MM-DD using the LOCAL browser clock.
 *
 * Use this (not `todayDateStr`) when the Date was constructed from a
 * YYYY-MM-DD string via `new Date("...T00:00:00")` (local midnight) and then
 * manipulated with local methods like `setDate()`. The local clock is the
 * correct reference in that case.
 */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns all IANA timezone identifiers supported by this browser.
 * Falls back to a curated list if the browser doesn't support
 * `Intl.supportedValuesOf` (Safari < 15.4).
 */
export function getSupportedTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      "timeZone"
    );
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

const FALLBACK_TIMEZONES = [
  "Africa/Abidjan",
  "Africa/Accra",
  "Africa/Addis_Ababa",
  "Africa/Algiers",
  "Africa/Cairo",
  "Africa/Casablanca",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Tunis",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Halifax",
  "America/Lima",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/St_Johns",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Baghdad",
  "Asia/Bangkok",
  "Asia/Colombo",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Ho_Chi_Minh",
  "Asia/Hong_Kong",
  "Asia/Irkutsk",
  "Asia/Jakarta",
  "Asia/Kamchatka",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Krasnoyarsk",
  "Asia/Kuala_Lumpur",
  "Asia/Magadan",
  "Asia/Manila",
  "Asia/Novosibirsk",
  "Asia/Omsk",
  "Asia/Riyadh",
  "Asia/Sakhalin",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Asia/Ulaanbaatar",
  "Asia/Vladivostok",
  "Asia/Yakutsk",
  "Asia/Yekaterinburg",
  "Atlantic/Azores",
  "Atlantic/Cape_Verde",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Darwin",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Bucharest",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Prague",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Guam",
  "Pacific/Honolulu",
  "Pacific/Noumea",
  "Pacific/Port_Moresby",
  "Pacific/Apia",
  "UTC",
];
