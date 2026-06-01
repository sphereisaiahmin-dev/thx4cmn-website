MIDI_NOTE_MIN = 0
MIDI_NOTE_MAX = 127


def clamp_note_range(start, end):
    safe_start = max(MIDI_NOTE_MIN, int(start))
    safe_end = min(MIDI_NOTE_MAX, int(end))

    if safe_end < safe_start:
        return tuple()

    return tuple(range(safe_start, safe_end + 1))


def filter_note_numbers(note_numbers):
    filtered = []
    for note_number in note_numbers:
        note_value = int(note_number)
        if MIDI_NOTE_MIN <= note_value <= MIDI_NOTE_MAX:
            filtered.append(note_value)

    return filtered
