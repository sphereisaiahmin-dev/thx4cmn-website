import copy
import json
import base64
import unittest

from thxcmididevicecode.protocol_v1 import (
    PROTOCOL_VERSION,
    process_serial_chunk,
)


class ProtocolV1Tests(unittest.TestCase):
    def setUp(self):
        self.buffer = bytearray()
        self.state = {
            "notePreset": {
                "mode": "piano",
                "piano": {
                    "whiteKeyColor": "#969696",
                    "blackKeyColor": "#46466e",
                },
                "gradient": {
                    "colorA": "#ff4b5a",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
                "rain": {
                    "colorA": "#56d18d",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
            },
            "modifierChords": {
                "12": "min7",
                "13": "maj7",
                "14": "min",
                "15": "maj",
            },
        }
        self.capabilities = {
            "device": "thx-c",
            "protocolVersion": PROTOCOL_VERSION,
            "features": [
                "handshake",
                "get_state",
                "apply_config",
                "ping",
                "config_persistence",
                "note_presets_v1",
                "firmware_update_v1",
            ],
            "firmwareVersion": "0.9.4",
        }
        self.handshake_calls = 0
        self.firmware_events = []
        self.ts = 1739294400000

    def _context(self):
        return {
            "capabilities": self.capabilities,
            "get_state": self._get_state,
            "apply_config": self._apply_config,
            "firmware_begin": self._firmware_begin,
            "firmware_chunk": self._firmware_chunk,
            "firmware_file_complete": self._firmware_file_complete,
            "firmware_commit": self._firmware_commit,
            "firmware_abort": self._firmware_abort,
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

    def _firmware_begin(self, session_id, target_version, files):
        self.firmware_events.append(("begin", session_id, target_version, len(files)))
        return {"ok": True}

    def _firmware_chunk(self, session_id, path, chunk_index, data_base64):
        self.firmware_events.append(("chunk", session_id, path, chunk_index, data_base64))
        return {"ok": True}

    def _firmware_file_complete(self, session_id, path, size, sha256):
        self.firmware_events.append(("file_complete", session_id, path, size, sha256))
        return {"ok": True}

    def _firmware_commit(self, session_id, target_version):
        self.firmware_events.append(("commit", session_id, target_version))
        return {"ok": True, "payload": {"resetQueued": True}}

    def _firmware_abort(self, session_id, reason):
        self.firmware_events.append(("abort", session_id, reason))
        return {"ok": True}

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

    def test_apply_config_valid_piano_returns_ack(self):
        next_state = {
            "notePreset": {
                "mode": "piano",
                "piano": {
                    "whiteKeyColor": "#ffffff",
                    "blackKeyColor": "#111111",
                },
                "gradient": {
                    "colorA": "#ff4b5a",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
                "rain": {
                    "colorA": "#56d18d",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
            },
            "modifierChords": {
                "12": "min79",
                "13": "maj7",
                "14": "min",
                "15": "maj79",
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

    def test_apply_config_valid_gradient_returns_ack(self):
        next_state = {
            "notePreset": {
                "mode": "gradient",
                "piano": {
                    "whiteKeyColor": "#969696",
                    "blackKeyColor": "#46466e",
                },
                "gradient": {
                    "colorA": "#ff0000",
                    "colorB": "#0000ff",
                    "speed": 2.4,
                },
                "rain": {
                    "colorA": "#56d18d",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
            },
            "modifierChords": {
                "12": "min7",
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
                "config": next_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["payload"]["state"]["notePreset"]["mode"], "gradient")
        self.assertEqual(response["payload"]["state"]["notePreset"]["gradient"]["speed"], 2.4)

    def test_apply_config_valid_rain_returns_ack(self):
        next_state = {
            "notePreset": {
                "mode": "rain",
                "piano": {
                    "whiteKeyColor": "#969696",
                    "blackKeyColor": "#46466e",
                },
                "gradient": {
                    "colorA": "#ff4b5a",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
                "rain": {
                    "colorA": "#00ff99",
                    "colorB": "#2211ff",
                    "speed": 0.3,
                },
            },
            "modifierChords": {
                "12": "min7",
                "13": "maj7",
                "14": "min",
                "15": "maj",
            },
        }

        request = {
            "v": 1,
            "type": "apply_config",
            "id": "config-3",
            "ts": self.ts,
            "payload": {
                "configId": "cfg-3",
                "idempotencyKey": "idem-3",
                "config": next_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["payload"]["state"]["notePreset"]["mode"], "rain")
        self.assertEqual(response["payload"]["state"]["notePreset"]["rain"]["speed"], 0.3)

    def test_apply_config_invalid_color_returns_nack(self):
        invalid_state = {
            "notePreset": {
                "mode": "piano",
                "piano": {
                    "whiteKeyColor": "#GGGGGG",
                    "blackKeyColor": "#111111",
                },
                "gradient": {
                    "colorA": "#ff4b5a",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
                "rain": {
                    "colorA": "#56d18d",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
            },
            "modifierChords": {
                "12": "min7",
                "13": "maj7",
                "14": "min",
                "15": "maj",
            },
        }

        request = {
            "v": 1,
            "type": "apply_config",
            "id": "config-bad-color",
            "ts": self.ts,
            "payload": {
                "configId": "cfg-bad-color",
                "idempotencyKey": "idem-bad-color",
                "config": invalid_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "nack")
        self.assertEqual(response["payload"]["requestType"], "apply_config")
        self.assertEqual(response["payload"]["code"], "invalid_config")
        self.assertFalse(response["payload"]["retryable"])

    def test_apply_config_invalid_speed_returns_nack(self):
        invalid_state = {
            "notePreset": {
                "mode": "gradient",
                "piano": {
                    "whiteKeyColor": "#969696",
                    "blackKeyColor": "#46466e",
                },
                "gradient": {
                    "colorA": "#ff4b5a",
                    "colorB": "#559bff",
                    "speed": 4.1,
                },
                "rain": {
                    "colorA": "#56d18d",
                    "colorB": "#559bff",
                    "speed": 1.0,
                },
            },
            "modifierChords": {
                "12": "min7",
                "13": "maj7",
                "14": "min",
                "15": "maj",
            },
        }

        request = {
            "v": 1,
            "type": "apply_config",
            "id": "config-bad-speed",
            "ts": self.ts,
            "payload": {
                "configId": "cfg-bad-speed",
                "idempotencyKey": "idem-bad-speed",
                "config": invalid_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "nack")
        self.assertEqual(response["payload"]["requestType"], "apply_config")
        self.assertEqual(response["payload"]["code"], "invalid_config")
        self.assertFalse(response["payload"]["retryable"])

    def test_apply_config_legacy_show_black_keys_migrates(self):
        legacy_state = {
            "showBlackKeys": False,
            "modifierChords": {
                "12": "min79",
                "13": "maj7",
                "14": "min",
                "15": "maj79",
            },
        }

        request = {
            "v": 1,
            "type": "apply_config",
            "id": "config-legacy",
            "ts": self.ts,
            "payload": {
                "configId": "cfg-legacy",
                "idempotencyKey": "idem-legacy",
                "config": legacy_state,
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        state = response["payload"]["state"]
        self.assertEqual(state["notePreset"]["mode"], "piano")
        self.assertEqual(
            state["notePreset"]["piano"]["blackKeyColor"],
            state["notePreset"]["piano"]["whiteKeyColor"],
        )
        self.assertEqual(state["modifierChords"]["12"], "min79")

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

    def test_handler_exception_returns_internal_error(self):
        request = {
            "v": 1,
            "type": "firmware_begin",
            "id": "fw-begin-crash",
            "ts": self.ts,
            "payload": {
                "sessionId": "session-crash",
                "targetVersion": "0.9.4",
                "files": [
                    {
                        "path": "/code.py",
                        "size": 4,
                        "sha256": "a" * 64,
                    }
                ],
            },
        }

        context = self._context()

        def _raise(*_args, **_kwargs):
            raise RuntimeError("boom")

        context["firmware_begin"] = _raise
        responses = process_serial_chunk(
            self.buffer,
            (json.dumps(request) + "\n").encode("utf-8"),
            context,
            self.ts,
        )
        response = self._decode_single(responses)
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["id"], "fw-begin-crash")
        self.assertEqual(response["payload"]["code"], "internal_error")
        self.assertEqual(response["payload"]["details"]["type"], "firmware_begin")

    def test_firmware_begin_returns_ack(self):
        request = {
            "v": 1,
            "type": "firmware_begin",
            "id": "fw-begin-1",
            "ts": self.ts,
            "payload": {
                "sessionId": "session-1",
                "targetVersion": "0.9.4",
                "files": [
                    {
                        "path": "/code.py",
                        "size": 4,
                        "sha256": "a" * 64,
                    }
                ],
            },
        }

        response = self._decode_single(self._send(request))
        self.assertEqual(response["type"], "ack")
        self.assertEqual(response["payload"]["requestType"], "firmware_begin")
        self.assertEqual(self.firmware_events[0][0], "begin")

    def test_firmware_flow_acks(self):
        begin_request = {
            "v": 1,
            "type": "firmware_begin",
            "id": "fw-begin-2",
            "ts": self.ts,
            "payload": {
                "sessionId": "session-2",
                "targetVersion": "0.9.4",
                "files": [
                    {
                        "path": "/protocol_v1.py",
                        "size": 4,
                        "sha256": "b" * 64,
                    }
                ],
            },
        }
        begin_response = self._decode_single(self._send(begin_request))
        self.assertEqual(begin_response["type"], "ack")

        chunk_request = {
            "v": 1,
            "type": "firmware_chunk",
            "id": "fw-chunk-2",
            "ts": self.ts,
            "payload": {
                "sessionId": "session-2",
                "path": "/protocol_v1.py",
                "chunkIndex": 0,
                "dataBase64": base64.b64encode(b"test").decode("ascii"),
            },
        }
        chunk_response = self._decode_single(self._send(chunk_request))
        self.assertEqual(chunk_response["type"], "ack")
        self.assertEqual(chunk_response["payload"]["requestType"], "firmware_chunk")

        complete_request = {
            "v": 1,
            "type": "firmware_file_complete",
            "id": "fw-complete-2",
            "ts": self.ts,
            "payload": {
                "sessionId": "session-2",
                "path": "/protocol_v1.py",
                "size": 4,
                "sha256": "b" * 64,
            },
        }
        complete_response = self._decode_single(self._send(complete_request))
        self.assertEqual(complete_response["type"], "ack")
        self.assertEqual(complete_response["payload"]["requestType"], "firmware_file_complete")

        commit_request = {
            "v": 1,
            "type": "firmware_commit",
            "id": "fw-commit-2",
            "ts": self.ts,
            "payload": {
                "sessionId": "session-2",
                "targetVersion": "0.9.4",
            },
        }
        commit_response = self._decode_single(self._send(commit_request))
        self.assertEqual(commit_response["type"], "ack")
        self.assertEqual(commit_response["payload"]["requestType"], "firmware_commit")


if __name__ == "__main__":
    unittest.main()
