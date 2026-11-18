import { CoreTypes, Utils } from '@nativescript/core';
import * as geolocation from '@nativescript/geolocation';

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
}

export class LocationDenied extends Error {
  constructor() {
    super('Location is off for this app.');
  }
}

/** One good fix from GPS, asking for permission the first time. */
export async function currentFix(): Promise<Fix> {
  try {
    await geolocation.enableLocationRequest(false, false);
  } catch {
    throw new LocationDenied();
  }
  if (!(await geolocation.isEnabled())) throw new LocationDenied();
  const loc = await geolocation.getCurrentLocation({ desiredAccuracy: CoreTypes.Accuracy.high, maximumAge: 15_000, timeout: 20_000 });
  const fix: Fix = { lat: loc.latitude, lng: loc.longitude };
  if (loc.horizontalAccuracy > 0) fix.accuracy = Math.round(loc.horizontalAccuracy);
  // iOS marks a missing altitude with a negative vertical accuracy; Android's plugin reports a missing one as exactly 0.
  const hasAltitude = __APPLE__ ? loc.verticalAccuracy > 0 : loc.altitude !== 0;
  if (Number.isFinite(loc.altitude) && hasAltitude) fix.altitude = loc.altitude;
  return fix;
}

export function openAppSettings(): void {
  if (__APPLE__) {
    Utils.openUrl(UIApplicationOpenSettingsURLString);
  } else {
    const ctx = Utils.android.getApplicationContext();
    const intent = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts('package', ctx.getPackageName(), null));
    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
    ctx.startActivity(intent);
  }
}

// ── Compass heading ────────────────────────────────────────────────────────

type HeadingListener = (degrees: number) => void;

let iosHeadingDelegateClass: any;

function watchHeadingIOS(listener: HeadingListener): () => void {
  if (!CLLocationManager.headingAvailable()) return () => {};
  iosHeadingDelegateClass ??= (NSObject as any).extend(
    {
      locationManagerDidUpdateHeading(_manager: CLLocationManager, heading: CLHeading) {
        if (heading.headingAccuracy < 0) return;
        (this as any).listener?.(heading.trueHeading >= 0 ? heading.trueHeading : heading.magneticHeading);
      },
      locationManagerShouldDisplayHeadingCalibration() {
        return false;
      },
    },
    { protocols: [CLLocationManagerDelegate] },
  );
  const delegate = iosHeadingDelegateClass.new();
  delegate.listener = listener;
  const manager = CLLocationManager.new();
  manager.headingFilter = 1;
  manager.delegate = delegate;
  manager.startUpdatingHeading();
  return () => {
    manager.stopUpdatingHeading();
    delegate.listener = null;
    // The delegate is held weakly by the manager; this closure keeps both alive until stopped.
    manager.delegate = null;
  };
}

function watchHeadingAndroid(listener: HeadingListener, near?: Fix): () => void {
  const SM = android.hardware.SensorManager;
  const ctx = Utils.android.getApplicationContext();
  const manager = ctx.getSystemService(android.content.Context.SENSOR_SERVICE) as android.hardware.SensorManager;
  const sensor = manager?.getDefaultSensor(android.hardware.Sensor.TYPE_ROTATION_VECTOR);
  if (!sensor) return () => {};
  // The rotation vector points at magnetic north; the declination at the user's spot turns that into true north.
  const declination = near ? new android.hardware.GeomagneticField(near.lat, near.lng, near.altitude ?? 0, Date.now()).getDeclination() : 0;
  const matrix = (Array as any).create('float', 9);
  const orientation = (Array as any).create('float', 3);
  const sensorListener = new android.hardware.SensorEventListener({
    onSensorChanged(event: android.hardware.SensorEvent) {
      SM.getRotationMatrixFromVector(matrix, event.values);
      SM.getOrientation(matrix, orientation);
      listener(((((orientation[0] * 180) / Math.PI + declination) % 360) + 360) % 360);
    },
    onAccuracyChanged() {},
  });
  manager.registerListener(sensorListener, sensor, SM.SENSOR_DELAY_UI);
  return () => manager.unregisterListener(sensorListener);
}

/**
 * Calls `listener` with the direction the phone's top points, in degrees from
 * true north, smoothed and at most ~8 times a second. Returns a stop function.
 * Simulators have no compass and never call it.
 */
export function watchHeading(listener: HeadingListener, near?: Fix): () => void {
  let x = 0;
  let y = 0;
  let last = 0;
  let primed = false;
  const smoothed = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    // Averaging on the unit circle keeps 359° and 1° from averaging to 180°.
    x = primed ? x * 0.7 + Math.cos(r) * 0.3 : Math.cos(r);
    y = primed ? y * 0.7 + Math.sin(r) * 0.3 : Math.sin(r);
    primed = true;
    const now = Date.now();
    if (now - last < 120) return;
    last = now;
    listener(((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360);
  };
  try {
    return __APPLE__ ? watchHeadingIOS(smoothed) : watchHeadingAndroid(smoothed, near);
  } catch (e) {
    console.warn('Field Notes: no compass', e);
    return () => {};
  }
}

// ── Reverse geocoding ─────────────────────────────────────────────────────

function joinPlace(primary?: string | null, area?: string | null): string | undefined {
  const a = primary?.trim();
  const b = area?.trim();
  if (a && b && a !== b) return `${a}, ${b}`;
  return a || b || undefined;
}

function reverseIOS(lat: number, lng: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    CLGeocoder.new().reverseGeocodeLocationCompletionHandler(CLLocation.alloc().initWithLatitudeLongitude(lat, lng), (marks, error) => {
      const p = !error && marks && marks.count ? marks.objectAtIndex(0) : null;
      if (!p) return resolve(undefined);
      const poi = p.areasOfInterest?.count ? p.areasOfInterest.objectAtIndex(0) : null;
      const street = [p.subThoroughfare, p.thoroughfare].filter(Boolean).join(' ');
      // CLPlacemark.name is a landmark's name, or the street address when there's none.
      const named = p.name && p.name !== street ? p.name : null;
      resolve(joinPlace(poi ?? named ?? p.thoroughfare ?? p.subLocality, p.locality ?? p.administrativeArea ?? p.country));
    });
  });
}

function describeAddress(a: android.location.Address): string | undefined {
  const feature = a.getFeatureName();
  const street = a.getThoroughfare();
  const named = feature && !/^\d+[\w-]*$/.test(feature) && feature !== street && feature !== a.getAddressLine(0) ? feature : null;
  return joinPlace(named ?? street ?? a.getSubLocality(), a.getLocality() ?? a.getAdminArea() ?? a.getCountryName());
}

function reverseAndroid(lat: number, lng: number): Promise<string | undefined> {
  const Geocoder = android.location.Geocoder;
  if (!Geocoder.isPresent()) return Promise.resolve(undefined);
  const geocoder = new Geocoder(Utils.android.getApplicationContext(), java.util.Locale.getDefault());
  if (android.os.Build.VERSION.SDK_INT >= 33) {
    return new Promise((resolve) => {
      const done = (value?: string) => setTimeout(() => resolve(value));
      geocoder.getFromLocation(
        lat,
        lng,
        1,
        new Geocoder.GeocodeListener({
          onGeocode(list: java.util.List<android.location.Address>) {
            done(list && list.size() > 0 ? describeAddress(list.get(0)) : undefined);
          },
          onError() {
            done(undefined);
          },
        }),
      );
    });
  }
  return new Promise((resolve) =>
    setTimeout(() => {
      try {
        const list = geocoder.getFromLocation(lat, lng, 1);
        resolve(list && list.size() > 0 ? describeAddress(list.get(0)) : undefined);
      } catch {
        resolve(undefined);
      }
    }),
  );
}

/** A human name for a spot ("Ferry Building, San Francisco"), from the platform's geocoder; undefined offline or at sea. */
export async function placeName(lat: number, lng: number): Promise<string | undefined> {
  try {
    const name = await Promise.race([__APPLE__ ? reverseIOS(lat, lng) : reverseAndroid(lat, lng), new Promise<undefined>((r) => setTimeout(() => r(undefined), 8000))]);
    return name;
  } catch {
    return undefined;
  }
}
