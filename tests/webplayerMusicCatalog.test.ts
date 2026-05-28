import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTracksFromKeys,
  deriveTrackTitleFromKey,
  isPlayableMusicKey,
} from '../src/lib/webplayer/music-catalog.ts';

test('isPlayableMusicKey only accepts root-level music mp3 objects', () => {
  assert.equal(isPlayableMusicKey('music/Track A.mp3'), true);
  assert.equal(isPlayableMusicKey('music/Track B.MP3'), true);
  assert.equal(isPlayableMusicKey('music/'), false);
  assert.equal(isPlayableMusicKey('music/folder/Track C.mp3'), false);
  assert.equal(isPlayableMusicKey('music/Track D.m4a'), false);
  assert.equal(isPlayableMusicKey('downloads/Track E.mp3'), false);
});

test('deriveTrackTitleFromKey decodes encoded characters and strips extension', () => {
  assert.equal(deriveTrackTitleFromKey('music/Space+Cadet%20Mix.mp3'), 'Space Cadet Mix');
  assert.equal(deriveTrackTitleFromKey('music/LOUD.MP3'), 'LOUD');
});

test('createTracksFromKeys filters invalid entries and sorts deterministically by key', () => {
  const tracks = createTracksFromKeys([
    'music/z-last.mp3',
    'music/',
    'music/A First.mp3',
    'music/not-supported.wav',
    'music/subfolder/hidden.mp3',
    'music/Middle%20Track.mp3',
  ]);

  assert.deepEqual(tracks, [
    {
      key: 'music/A First.mp3',
      title: 'A First',
    },
    {
      key: 'music/Middle%20Track.mp3',
      title: 'Middle Track',
    },
    {
      key: 'music/z-last.mp3',
      title: 'z-last',
    },
  ]);
});
