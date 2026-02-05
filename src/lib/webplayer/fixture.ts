export const LOCAL_FIXTURE_PREFIX = 'local-fixture/';
export const LOCAL_FIXTURE_TRACK_KEY = `${LOCAL_FIXTURE_PREFIX}Dreams Come True.mp3`;

export const localFixtureTrack = {
  key: LOCAL_FIXTURE_TRACK_KEY,
  title: 'Dreams Come True',
};

export const toFixtureSignedUrl = (key: string) =>
  `/api/music/local-fixture?key=${encodeURIComponent(key)}`;
