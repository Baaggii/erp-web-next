# Login device context and location capture

The login form now collects and forwards basic device context so POS sessions
can be reconciled with device and location metadata.

## Fields sent to the login endpoint

- `deviceUuid` (string): A persistent, randomly generated identifier stored in
  `localStorage` so browsers and desktop shells re-use the same value. Native
  apps can swap this for a platform-provided device identifier.
- `deviceMac` (string): Mirrors `deviceUuid` as a surrogate when a MAC address
  is unavailable in web environments.
- `location` (object): `{ lat, lon }` coordinates gathered from the HTML5
  Geolocation API. Values default to `null` when missing.

## Permissions and fallbacks

- Browsers prompt the user for location permission; if the user declines or an
  error occurs, the login payload still includes `location: { lat: null, lon: null }`.
- The device identifier is generated client-side without any MAC lookup, so it
  works on both desktop and mobile web without additional permissions.

## Database expectations

Ensure the production `pos_session` table includes `device_mac`,
`location_lat`, and `location_lon` so the session logger can persist the
incoming fields. Missing columns will cause the logger to drop the values at
runtime.
