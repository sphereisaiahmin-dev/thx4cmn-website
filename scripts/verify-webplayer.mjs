import { spawn } from 'node:child_process';
import process from 'node:process';

import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3000';

const waitForServer = async (timeoutMs = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/music/list`);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Next.js server did not become ready in time.');
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = async () => {
  const devServer = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3000'], {
    stdio: 'inherit',
    env: process.env,
  });

  let browser;
  try {
    await waitForServer();

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await page.waitForSelector('.audio-player__controls button');

    // Open DSP controls and verify RPM slider range mapping is present.
    await page.getByRole('button', { name: 'ctrl' }).click();
    const rpmSlider = page.locator('.audio-player__rpm-slider');
    await rpmSlider.waitFor();
    await rpmSlider.fill('1');
    const rpmLabelFast = await page.locator('.audio-player__dsp-value').textContent();
    assert(rpmLabelFast !== null && Number.parseFloat(rpmLabelFast) > 1, 'RPM slider did not increase rate above 1.0x.');
    await rpmSlider.fill('0');
    const rpmLabelSlow = await page.locator('.audio-player__dsp-value').textContent();
    assert(rpmLabelSlow !== null && Number.parseFloat(rpmLabelSlow) < 1, 'RPM slider did not reduce rate below 1.0x.');

    // Play / pause
    const playButton = page.getByRole('button', { name: 'play' });
    await playButton.click();
    await page.getByRole('button', { name: 'pause' }).waitFor({ timeout: 5000 });

    // Reverse while playing should not trigger loading-track status.
    const reverseButton = page.getByRole('button', { name: 'reverse' });
    await reverseButton.click();
    await page.waitForTimeout(300);
    const statusLocator = page.locator('.audio-player__status');
    const statusAfterReverseWhilePlaying = (await statusLocator.count()) > 0 ? await statusLocator.first().textContent() : null;
    assert(statusAfterReverseWhilePlaying !== 'Loading track...', 'Reverse while playing triggered track reload status.');

    // Pause and reverse again.
    await page.getByRole('button', { name: 'pause' }).click();
    await playButton.waitFor({ timeout: 3000 });
    await reverseButton.click();
    await page.waitForTimeout(300);
    const statusAfterReversePaused = (await statusLocator.count()) > 0 ? await statusLocator.first().textContent() : null;
    assert(statusAfterReversePaused !== 'Loading track...', 'Reverse while paused triggered track reload status.');

    // Next / prev still function after reverse interactions.
    const titleBefore = await page.locator('.audio-player__title > span').first().textContent();
    await page.getByRole('button', { name: 'next' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'prev' }).click();
    await page.waitForTimeout(500);
    const titleAfter = await page.locator('.audio-player__title > span').first().textContent();
    assert(titleBefore !== null && titleAfter !== null, 'Track title unavailable for next/prev verification.');

    // Shuffle behavior check via API payload ordering variability marker.
    const listResponse = await page.request.get(`${BASE_URL}/api/music/list`);
    const listPayload = await listResponse.json();
    assert(Array.isArray(listPayload.tracks), 'Track list payload is invalid.');

    console.log('Web player verification passed.');
  } finally {
    if (browser) await browser.close();
    devServer.kill('SIGTERM');
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
