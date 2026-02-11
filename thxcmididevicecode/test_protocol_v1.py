import json
import unittest

from thxcmididevicecode.protocol_v1 import PROTOCOL_VERSION, process_serial_chunk


class ProtocolV1Tests(unittest.TestCase):
    def setUp(self):
        self.buffer = bytearray()
        self.capabilities = {
            "device": "thx-c pico midi",
            "protocolVersion": PROTOCOL_VERSION,
            "features": ["handshake"],
            "firmwareVersion": "1.0.0",
        }
        self.ts = 1739294400000

    def _decode_single(self, responses):
        self.assertEqual(len(responses), 1)
        return json.loads(responses[0].decode("utf-8").strip())

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

        responses = process_serial_chunk(
            self.buffer,
            (json.dumps(request) + "\n").encode("utf-8"),
            self.capabilities,
            self.ts,
        )

        response = self._decode_single(responses)
        self.assertEqual(response["type"], "hello_ack")
        self.assertEqual(response["id"], request["id"])
        self.assertEqual(response["payload"], self.capabilities)

    def test_invalid_json_returns_error(self):
        responses = process_serial_chunk(
            self.buffer,
            b'{"v":1,"type":"hello",\n',
            self.capabilities,
            self.ts,
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

        responses = process_serial_chunk(
            self.buffer,
            (json.dumps(request) + "\n").encode("utf-8"),
            self.capabilities,
            self.ts,
        )

        response = self._decode_single(responses)
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

        responses = process_serial_chunk(
            self.buffer,
            (json.dumps(request) + "\n").encode("utf-8"),
            self.capabilities,
            self.ts,
        )

        response = self._decode_single(responses)
        self.assertEqual(response["type"], "error")
        self.assertEqual(response["id"], "hello-3")
        self.assertEqual(response["payload"]["code"], "unsupported_type")


if __name__ == "__main__":
    unittest.main()
