import assert from 'node:assert/strict';
import test from 'node:test';

import { toPublicMusicTracks } from '../src/lib/musicTrackList.ts';

test('public music tracks include only exact music mp3 objects', () => {
  assert.deepEqual(
    toPublicMusicTracks([
      'music/Dreams+Come+True.mp3',
      'music/Set%20Closer.MP3',
      'music/readme.txt',
      'private/hidden.mp3',
      'music/nested/live.wav',
    ]),
    [
      { key: 'music/Dreams+Come+True.mp3', title: 'Dreams Come True' },
      { key: 'music/Set%20Closer.MP3', title: 'Set Closer' },
    ],
  );
});
