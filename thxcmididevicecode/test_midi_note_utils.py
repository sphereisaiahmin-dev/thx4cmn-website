import unittest

from thxcmididevicecode.midi_note_utils import clamp_note_range, filter_note_numbers


class MidiNoteUtilsTests(unittest.TestCase):
    def test_clamp_note_range_caps_values_to_valid_midi_bounds(self):
        self.assertEqual(clamp_note_range(-5, 3), (0, 1, 2, 3))
        self.assertEqual(clamp_note_range(126, 130), (126, 127))

    def test_clamp_note_range_returns_empty_tuple_when_range_is_outside_midi_bounds(self):
        self.assertEqual(clamp_note_range(140, 150), tuple())
        self.assertEqual(clamp_note_range(-20, -1), tuple())

    def test_filter_note_numbers_discards_out_of_range_notes(self):
        self.assertEqual(filter_note_numbers([-2, 0, 64, 127, 128]), [0, 64, 127])


if __name__ == "__main__":
    unittest.main()
