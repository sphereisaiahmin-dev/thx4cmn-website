import json
import unittest

from thxcmididevicecode.protocol_v1 import PROTOCOL_VERSION, process_serial_chunk


class ProtocolV1Tests(unittest.TestCase):
    def setUp(self):
        self.buffer = bytearray()
        self.capabilities = {
            "device": "thx-c pico midi",
            "protocolVersion": PROTOCOL_VERSION,
            "features": ["handshake", "apply_config"],
            "firmwareVersion": "1.1.0",
        }
        self.ts = 1739294400000

        self.allowed_chords = {
            "maj",
            "min",
            "maj7",
            "min7",
            "maj9",
            "min9",
            "maj79",
            "min79",
        }
        self.allowed_presets = {"piano", "aurora_scene", "sunset_scene", "ocean_scene"}
        self.expected_modifier_keys = {"12", "13", "14", "15"}
        self.expected_note_keys = {str(index) for index in range(12)}

        self.applied = None
        self.apply_count = 0
        self.last_idempotency_key = None
        self.last_applied_version = 0

    def _decode_single(self, responses):
        self.assertEqual(len(responses), 1)
        return json.loads(responses[0].decode("utf-8").strip())

    def _process(self, request, handler=True):
        payload = (json.dumps(request) + "\n").encode("utf-8")
        callback = self._apply_config if handler else None
        return process_serial_chunk(self.buffer, payload, self.capabilities, self.ts, callback)

    def _apply_config(self, payload):
        modifier = payload["modifierChords"]
        note_presets = payload["noteKeyColorPresets"]

        if set(modifier.keys()) != self.expected_modifier_keys:
            return {
                "ok": False,
                "code": "invalid_modifier_key",
                "reason": "modifierChords must contain keys 12,13,14,15.",
                "retryable": False,
            }

        for chord in modifier.values():
            if chord not in self.allowed_chords:
                return {
                    "ok": False,
                    "code": "invalid_chord",
                    "reason": "Unsupported chord.",
                    "retryable": False,
                }

        if set(note_presets.keys()) != self.expected_note_keys:
            return {
                "ok": False,
                "code": "invalid_note_key",
                "reason": "noteKeyColorPresets must contain keys 0-11.",
                "retryable": False,
            }

        for preset in note_presets.values():
            if preset not in self.allowed_presets:
                return {
                    "ok": False,
                    "code": "invalid_preset",
                    "reason": "Unsupported note preset.",
                    "retryable": False,
                }

        idempotency_key = payload["idempotencyKey"]
        if idempotency_key == self.last_idempotency_key:
            return {"ok": True, "appliedConfigVersion": self.last_applied_version}

        self.apply_count += 1
        self.applied = payload
        self.last_idempotency_key = idempotency_key
        self.last_applied_version = payload["configVersion"]
        return {"ok": True, "appliedConfigVersion": payload["configVersion"]}

    def _base_apply_request(self, config_version=1):
        return {
            "v": 1,
            "type": "apply_config",
            "id": "apply-1",
            "ts": self.ts,
            "payload": {
                "modifierChords": {
                    "12": "min7",
                    "13": "maj7",
                    "14": "min",
                    "15": "maj",
                },
                "noteKeyColorPresets": {str(index): "piano" for index in range(12)},
                "idempotencyKey": f"id-{config_version}",
                "configVersion": config_version,
            },
        }

    def test_valid_hello_returns_hello_ack(self):
        request = {
            "v": 1,
            "type": "hello",
            "id": "hello-1",
            "ts": self.ts,
            "payload": {
                "client": "thx4cmn-website",
                "requestedProtocolVersion": 1,
            },
        }

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "hello_ack")
        self.assertEqual(response["id"], request["id"])
        self.assertEqual(response["payload"], self.capabilities)

    def test_invalid_json_returns_error(self):
        responses = process_serial_chunk(
            self.buffer,
            b'{"v":1,"type":"hello",\n',
            self.capabilities,
            self.ts,
            self._apply_config,
        )

        response = self._decode_single(responses)
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["payload"]["code"], "malformed_frame")

    def test_unsupported_version_returns_error(self):
        request = {
            "v": 2,
            "type": "hello",
            "id": "hello-2",
            "ts": self.ts,
            "payload": {
                "client": "thx4cmn-website",
                "requestedProtocolVersion": 2,
            },
        }

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["id"], "hello-2")
        self.assertEqual(response["payload"]["code"], "unsupported_version")

    def test_unsupported_type_returns_error(self):
        request = {
            "v": 1,
            "type": "unknown_message",
            "id": "hello-3",
            "ts": self.ts,
            "payload": {
                "client": "thx4cmn-website",
                "requestedProtocolVersion": 1,
            },
        }

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["id"], "hello-3")
        self.assertEqual(response["payload"]["code"], "unsupported_type")

    def test_valid_apply_config_returns_ack(self):
        request = self._base_apply_request(4)

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["id"], "apply-1")
        self.assertEqual(response["payload"]["requestType"], "apply_config")
        self.assertEqual(response["payload"]["appliedConfigVersion"], 4)
        self.assertEqual(self.apply_count, 1)

    def test_invalid_chord_returns_nack(self):
        request = self._base_apply_request(5)
        request["payload"]["modifierChords"]["12"] = "sus4"

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "nack")
        self.assertEqual(response["payload"]["code"], "invalid_chord")

    def test_invalid_modifier_key_returns_nack(self):
        request = self._base_apply_request(6)
        request["payload"]["modifierChords"] = {
            "11": "min7",
            "13": "maj7",
            "14": "min",
            "15": "maj",
        }

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "nack")
        self.assertEqual(response["payload"]["code"], "invalid_modifier_key")

    def test_invalid_note_preset_mapping_returns_nack(self):
        request = self._base_apply_request(7)
        request["payload"]["noteKeyColorPresets"]["4"] = "invalid_scene"

        response = self._decode_single(self._process(request))
        self.assertEqual(response["type"], "nack")
        self.assertEqual(response["payload"]["code"], "invalid_preset")

    def test_idempotent_resend_returns_same_version(self):
        request = self._base_apply_request(8)
        first_response = self._decode_single(self._process(request))
        second_response = self._decode_single(self._process(request))

        self.assertEqual(first_response["type"], "ack")
        self.assertEqual(second_response["type"], "ack")
        self.assertEqual(first_response["payload"]["appliedConfigVersion"], 8)
        self.assertEqual(second_response["payload"]["appliedConfigVersion"], 8)
        self.assertEqual(self.apply_count, 1)


if __name__ == "__main__":
    unittest.main()
