import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { chromium } from 'playwright';

const SERVER_PORT = 3101;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const NEXT_BIN_PATH = resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const NEXT_CACHE_PATH = resolve(process.cwd(), '.next');

const sleep = (ms: number) =>
  new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });

const waitForServer = async (url: string, output: string[]) => {
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting for the dev server to come online.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}.\n${output.join('')}`);
};

test(
  'device page survives firmware lookup failure and prevents chooser reentry',
  { timeout: 120000 },
  async (t) => {
    if (existsSync(NEXT_CACHE_PATH)) {
      rmSync(NEXT_CACHE_PATH, { force: true, recursive: true });
    }

    const output: string[] = [];
    const server = spawn(
      process.execPath,
      [NEXT_BIN_PATH, 'dev', '--hostname', '127.0.0.1', '--port', String(SERVER_PORT)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    server.stdout.on('data', (chunk) => output.push(chunk.toString()));
    server.stderr.on('data', (chunk) => output.push(chunk.toString()));

    t.after(async () => {
      if (!server.killed) {
        server.kill();
      }

      await Promise.race([
        new Promise<void>((resolveExit) => {
          server.once('exit', () => resolveExit());
        }),
        sleep(4000),
      ]);
    });

    await waitForServer(`${BASE_URL}/device`, output);

    const browser = await chromium.launch({ headless: true });
    t.after(async () => {
      await browser.close();
    });

    const page = await browser.newPage();
    const pageErrors: string[] = [];
    const relevantConsoleErrors: string[] = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') {
        return;
      }

      const text = message.text();
      if (text.includes('Firmware update lookup failed') || text.includes('Connection failed')) {
        relevantConsoleErrors.push(text);
      }
    });

    await page.route('**/api/device/firmware/latest*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced_lookup_failure' }),
      });
    });

    await page.addInitScript(() => {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      class MockSerialPort {
        constructor() {
          this._buffer = '';
          this._controller = null;
          this.readable = new ReadableStream({
            start: (controller) => {
              this._controller = controller;
            },
          });
          this.writable = new WritableStream({
            write: (chunk) => {
              this._buffer += decoder.decode(chunk, { stream: true });
              let newlineIndex = this._buffer.indexOf('\n');
              while (newlineIndex >= 0) {
                const line = this._buffer.slice(0, newlineIndex).replace(/\r$/, '');
                this._buffer = this._buffer.slice(newlineIndex + 1);
                if (line.trim()) {
                  this._handleLine(line);
                }
                newlineIndex = this._buffer.indexOf('\n');
              }
            },
          });
        }

        async open() {}

        async close() {
          this._controller?.close();
        }

        _push(frame) {
          this._controller?.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
        }

        _handleLine(line) {
          const frame = JSON.parse(line);
          const base = {
            v: 1,
            id: frame.id,
            ts: Date.now(),
          };

          if (frame.type === 'hello') {
            this._push({
              ...base,
              type: 'hello_ack',
              payload: {
                device: 'hx01',
                protocolVersion: 1,
                features: [
                  'handshake',
                  'get_state',
                  'apply_config',
                  'ping',
                  'note_presets_v1',
                  'firmware_update_v1',
                ],
                firmwareVersion: '0.9.4',
                state: {
                  notePreset: {
                    mode: 'piano',
                    piano: {
                      whiteKeyColor: '#969696',
                      blackKeyColor: '#46466e',
                    },
                    gradient: {
                      colorA: '#ff4b5a',
                      colorB: '#559bff',
                      speed: 1,
                    },
                    rain: {
                      colorA: '#56d18d',
                      colorB: '#559bff',
                      speed: 1,
                    },
                  },
                  modifierChords: {
                    '12': 'min7',
                    '13': 'maj7',
                    '14': 'min',
                    '15': 'maj',
                  },
                },
              },
            });
            return;
          }

          if (frame.type === 'ping') {
            this._push({
              ...base,
              type: 'ack',
              payload: {
                requestType: 'ping',
                status: 'ok',
                pongTs: Date.now(),
              },
            });
          }
        }
      }

      window.__serialStats = {
        requestPortCalls: 0,
      };

      Object.defineProperty(navigator, 'serial', {
        configurable: true,
        value: {
          getPorts: async () => [],
          requestPort: async () => {
            window.__serialStats.requestPortCalls += 1;
            await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 250));
            return new MockSerialPort();
          },
          addEventListener: () => {},
          removeEventListener: () => {},
        },
      });
    });

    await page.goto(`${BASE_URL}/device`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const connectButton = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Connect',
      );
      if (!(connectButton instanceof HTMLButtonElement)) {
        throw new Error('Connect button not found.');
      }

      connectButton.click();
      connectButton.click();
    });

    await page.waitForFunction(() => document.body.textContent?.includes('Status: ready'));
    await page.waitForFunction(() => document.body.textContent?.includes('Connected to hx01 (0.9.4).'));

    const requestPortCalls = await page.evaluate(() => window.__serialStats?.requestPortCalls ?? 0);
    const bodyText = await page.locator('body').textContent();

    assert.equal(requestPortCalls, 1);
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
    assert.equal(relevantConsoleErrors.length, 0, relevantConsoleErrors.join('\n'));
    assert.match(bodyText ?? '', /Status:\s*ready/);
    assert.match(bodyText ?? '', /Connected to hx01 \(0\.9\.4\)\./);
  },
);
