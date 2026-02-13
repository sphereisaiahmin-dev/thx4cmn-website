import copy
import json
import unittest

from thxcmididevicecode.protocol_v1 import PROTOCOL_VERSION, process_serial_chunk


class ProtocolV1Tests(unittest.TestCase):
    def setUp(self):
        self.buffer = bytearray()
        self.state = {
            "showBlackKeys": False,
            "modifierChords": {
                "12": "min7",
                "13": "maj7",
                "14": "min",
                "15": "maj",
            },
        }
        self.capabilities = {
            "device": "thx-c pico midi",
            "protocolVersion": PROTOCOL_VERSION,
            "features": ["handshake", "get_state", "apply_config", "ping"],
            "firmwareVersion": "2.0.0",
        }
        self.handshake_calls = 0
        self.ts = 1739294400000

    def _context(self):
        return {
            "capabilities": self.capabilities,
            "get_state": self._get_state,
            "apply_config": self._apply_config,
            "on_handshake": self._on_handshake,
        }

    def _get_state(self):
        return copy.deepcopy(self.state)

    def _apply_config(self, config, config_id, _idempotency_key):
        self.state = copy.deepcopy(config)
        return {
            "ok": True,
            "state": copy.deepcopy(self.state),
            "appliedConfigId": config_id,
        }

    def _on_handshake(self):
        self.handshake_calls += 1

    def _decode_single(self, responses):
        self.assertEqual(len(responses), 1)
        return json.loads(responses[0].decode("utf-8").strip())

    def _send(self, request):
        return process_serial_chunk(
            self.buffer,
            (json.dumps(request) + "\n").encode("utf-8"),
            self._context(),
            self.ts,
        )

    def test_valid_hello_returns_hello_ack_with_state(self):
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

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "hello_ack")
        self.assertEqual(response["id"], request["id"])
        self.assertEqual(response["payload"]["state"], self.state)
        self.assertEqual(self.handshake_calls, 1)

    def test_get_state_returns_ack(self):
        request = {
            "v": 1,
            "type": "get_state",
            "id": "state-1",
            "ts": self.ts,
            "payload": {},
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["payload"]["requestType"], "get_state")
        self.assertEqual(response["payload"]["status"], "ok")
        self.assertEqual(response["payload"]["state"], self.state)

    def test_ping_returns_ack(self):
        request = {
            "v": 1,
            "type": "ping",
            "id": "ping-1",
            "ts": self.ts,
            "payload": {},
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["payload"]["requestType"], "ping")
        self.assertEqual(response["payload"]["status"], "ok")
        self.assertEqual(response["payload"]["pongTs"], self.ts)

    def test_apply_config_valid_returns_ack_and_updates_state(self):
        next_state = {
            "showBlackKeys": True,
            "modifierChords": {
                "12": "min9",
                "13": "maj7",
                "14": "min",
                "15": "maj9",
            },
        }

        request = {
            "v": 1,
            "type": "apply_config",
            "id": "config-1",
            "ts": self.ts,
            "payload": {
                "configId": "cfg-1",
                "idempotencyKey": "idem-1",
                "config": next_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["payload"]["requestType"], "apply_config")
        self.assertEqual(response["payload"]["status"], "ok")
        self.assertEqual(response["payload"]["appliedConfigId"], "cfg-1")
        self.assertEqual(response["payload"]["state"], next_state)
        self.assertEqual(self.state, next_state)

    def test_apply_config_invalid_returns_nack(self):
        invalid_state = {
            "showBlackKeys": True,
            "modifierChords": {
                "12": "unknown",
                "13": "maj7",
                "14": "min",
                "15": "maj",
            },
        }

        request = {
            "v": 1,
            "type": "apply_config",
            "id": "config-2",
            "ts": self.ts,
            "payload": {
                "configId": "cfg-2",
                "idempotencyKey": "idem-2",
                "config": invalid_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "nack")
        self.assertEqual(response["payload"]["requestType"], "apply_config")
        self.assertEqual(response["payload"]["code"], "invalid_config")
        self.assertFalse(response["payload"]["retryable"])

    def test_invalid_json_returns_error(self):
        responses = process_serial_chunk(
            self.buffer,
            b'{"v":1,"type":"hello",\n',
            self._context(),
            self.ts,
        )

        response = self._decode_single(responses)
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["payload"]["code"], "malformed_frame")

    def test_unsupported_type_returns_error(self):
        request = {
            "v": 1,
            "type": "unknown_message",
            "id": "hello-3",
            "ts": self.ts,
            "payload": {},
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["id"], "hello-3")
        self.assertEqual(response["payload"]["code"], "unsupported_type")


if __name__ == "__main__":
    unittest.main()
