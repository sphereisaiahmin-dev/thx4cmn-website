import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'snowy';

type OpenWeatherResponse = {
  name?: string;
  timezone?: number;
  dt?: number;
  sys?: {
    country?: string;
  };
  main?: {
    temp?: number;
  };
  weather?: Array<{
    id?: number;
    description?: string;
  }>;
};

const OPENWEATHER_ENDPOINT = 'https://api.openweathermap.org/data/2.5/weather';
const FALLBACK_CITY_QUERY = 'Los Angeles,US';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseCoordinate = (
  rawValue: string | null,
  min: number,
  max: number,
): number | null => {
  if (!rawValue) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
};

const mapCondition = (weatherId: number | undefined): WeatherCondition => {
  if (!isFiniteNumber(weatherId)) return 'cloudy';
  if (weatherId === 800) return 'sunny';
  if (weatherId >= 600 && weatherId <= 699) return 'snowy';
  if (weatherId >= 200 && weatherId <= 599) return 'rainy';
  return 'cloudy';
};

const toOneDecimal = (value: number) => Math.round(value * 10) / 10;

const buildLocationLabel = (payload: OpenWeatherResponse) => {
  const city = payload.name?.trim();
  const country = payload.sys?.country?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  return 'Los Angeles, US';
};

const fetchWeather = async (searchParams: URLSearchParams) => {
  const requestUrl = `${OPENWEATHER_ENDPOINT}?${searchParams.toString()}`;
  const response = await fetch(requestUrl, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = `OpenWeather request failed (${response.status}).`;
    throw new Error(message);
  }

  const payload = (await response.json()) as OpenWeatherResponse;
  return payload;
};

const normalizePayload = (payload: OpenWeatherResponse) => {
  const weatherSample = payload.weather?.[0];
  const tempC = payload.main?.temp;
  const normalizedCountryCode = payload.sys?.country?.trim().toUpperCase() || 'US';

  if (!isFiniteNumber(tempC)) {
    throw new Error('OpenWeather payload missing temperature.');
  }

  const roundedTempC = toOneDecimal(tempC);
  const roundedTempF = toOneDecimal((tempC * 9) / 5 + 32);
  const timezoneOffsetSeconds = isFiniteNumber(payload.timezone) ? payload.timezone : 0;
  const observationUnix = isFiniteNumber(payload.dt)
    ? Math.round(payload.dt)
    : Math.round(Date.now() / 1000);

  return {
    location: buildLocationLabel(payload),
    countryCode: normalizedCountryCode,
    condition: mapCondition(weatherSample?.id),
    conditionLabel: weatherSample?.description?.trim() || 'Cloudy',
    tempF: roundedTempF,
    tempC: roundedTempC,
    timezoneOffsetSeconds,
    observationUnix,
  };
};

export async function GET(request: Request) {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Weather service is not configured.' }, { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const lat = parseCoordinate(requestUrl.searchParams.get('lat'), -90, 90);
  const lon = parseCoordinate(requestUrl.searchParams.get('lon'), -180, 180);
  const hasCoordinates = lat !== null && lon !== null;

  const primaryParams = new URLSearchParams({
    appid: apiKey,
    units: 'metric',
  });

  if (hasCoordinates) {
    primaryParams.set('lat', lat.toString());
    primaryParams.set('lon', lon.toString());
  } else {
    primaryParams.set('q', FALLBACK_CITY_QUERY);
  }

  const fallbackParams = new URLSearchParams({
    appid: apiKey,
    units: 'metric',
    q: FALLBACK_CITY_QUERY,
  });

  try {
    const payload = await fetchWeather(primaryParams);
    return NextResponse.json(normalizePayload(payload), {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (primaryError) {
    if (!hasCoordinates) {
      const message = primaryError instanceof Error ? primaryError.message : 'Unable to load weather.';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    try {
      const fallbackPayload = await fetchWeather(fallbackParams);
      return NextResponse.json(normalizePayload(fallbackPayload), {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : 'Unable to load weather.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
}
