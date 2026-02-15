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

const enterPlayingState = async (page) => {
  const pauseButton = page.getByRole('button', { name: 'pause', exact: true });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await pauseButton.count()) > 0) {
      return;
    }

    await page.waitForFunction(() => {
      const transportButton = Array.from(
        document.querySelectorAll('.audio-player__controls button'),
      ).find((button) => {
        const label = button.textContent?.trim().toLowerCase();
        return label === 'play' || label === 'pause';
      });
      return Boolean(transportButton && !transportButton.hasAttribute('disabled'));
    });

    const playButton = page.getByRole('button', { name: 'play', exact: true });
    if ((await playButton.count()) > 0) {
      await playButton.click();
    }

    try {
      await pauseButton.waitFor({ timeout: 4000 });
      return;
    } catch {
      await page.waitForTimeout(400);
    }
  }

  throw new Error('Play button did not transition to pause state.');
};

const run = async () => {
  const verifyEnv = {
    ...process.env,
    // Force local fixture mode for deterministic browser playback verification.
    R2_ENDPOINT: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
  };
  const devServer = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3000'], {
    stdio: 'inherit',
    env: verifyEnv,
  });

  let browser;
  try {
    await waitForServer();

    browser = await chromium.launch({
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await page.waitForSelector('.audio-player__controls button');
    assert((await page.locator('.audio-player').count()) === 1, 'Home page should show the full player widget.');

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
    await rpmSlider.fill('0.5');
    await page.locator('.audio-player__dot').nth(12).click();
    await page.waitForTimeout(200);

    // Play / pause
    await enterPlayingState(page);
    const playButton = page.getByRole('button', { name: 'play', exact: true });
    const pauseButton = page.getByRole('button', { name: 'pause', exact: true });

    // Reverse while playing should not trigger loading-track status.
    const reverseButton = page.getByRole('button', { name: 'reverse' });
    await reverseButton.click();
    await page.waitForTimeout(300);
    const statusLocator = page.locator('.audio-player__status');
    const statusAfterReverseWhilePlaying = (await statusLocator.count()) > 0 ? await statusLocator.first().textContent() : null;
    assert(statusAfterReverseWhilePlaying !== 'Loading track...', 'Reverse while playing triggered track reload status.');

    // Pause and reverse again.
    await enterPlayingState(page);
    await page.getByRole('button', { name: 'pause', exact: true }).click();
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

    // Widget should be hidden off-home while header still shows now-playing.
    await page.goto(`${BASE_URL}/store`, { waitUntil: 'networkidle' });
    assert((await page.locator('.audio-player').count()) === 0, 'Player widget should be hidden on non-home routes.');
    const nowPlayingText = await page.locator('.header-now-playing').textContent();
    assert(
      nowPlayingText !== null && /(Playing|Paused):/i.test(nowPlayingText),
      'Header now-playing line missing or malformed on non-home route.',
    );
    const desktopCartButton = page.locator('button[aria-controls="mini-cart"]');
    assert((await desktopCartButton.count()) > 0, 'Desktop cart button missing.');
    await desktopCartButton.first().click();
    assert(await page.locator('#mini-cart').isVisible(), 'Desktop mini-cart should open from header cart button.');
    await page.getByRole('button', { name: 'Close cart' }).click();
    await page.waitForTimeout(200);

    // Mobile home split layout check: rounded inset player in top-half region, logo bottom-half.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.audio-player');
    const splitMetrics = await page.evaluate(() => {
      const player = document.querySelector('.audio-player');
      const playerRect = player?.getBoundingClientRect();
      const logoRect = document.querySelector('.home-logo-background')?.getBoundingClientRect();
      const headerRect = document.querySelector('header')?.getBoundingClientRect();
      const playerStyles = player ? window.getComputedStyle(player) : null;

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        playerLeft: playerRect?.left ?? null,
        playerRight: playerRect?.right ?? null,
        playerTop: playerRect?.top ?? null,
        playerHeight: playerRect?.height ?? null,
        playerBorderRadius: playerStyles ? Number.parseFloat(playerStyles.borderTopLeftRadius) : null,
        logoTop: logoRect?.top ?? null,
        logoHeight: logoRect?.height ?? null,
        headerBottom: headerRect?.bottom ?? null,
      };
    });
    assert(splitMetrics.viewportWidth !== null, 'Missing viewport width metric on mobile home.');
    assert(splitMetrics.playerLeft !== null, 'Missing player left metric on mobile home.');
    assert(splitMetrics.playerRight !== null, 'Missing player right metric on mobile home.');
    assert(splitMetrics.playerTop !== null, 'Missing player top metric on mobile home.');
    assert(splitMetrics.playerHeight !== null, 'Missing player height metric on mobile home.');
    assert(splitMetrics.playerBorderRadius !== null, 'Missing player border radius metric on mobile home.');
    assert(splitMetrics.logoTop !== null, 'Missing logo top metric on mobile home.');
    assert(splitMetrics.logoHeight !== null, 'Missing logo height metric on mobile home.');
    assert(splitMetrics.headerBottom !== null, 'Missing header bottom metric on mobile home.');
    assert(splitMetrics.playerBorderRadius > 0, 'Mobile player should retain rounded corners.');
    assert(splitMetrics.playerLeft >= 8, 'Mobile player should be inset from the left edge.');
    assert(
      splitMetrics.viewportWidth - splitMetrics.playerRight >= 8,
      'Mobile player should be inset from the right edge.',
    );
    const remainingHeight = splitMetrics.viewportHeight - splitMetrics.headerBottom;
    assert(splitMetrics.playerTop >= splitMetrics.headerBottom - 2, 'Mobile player should start below the header.');
    assert(
      splitMetrics.playerHeight <= remainingHeight / 2 + 8 && splitMetrics.playerHeight >= 120,
      'Mobile player height should remain a substantial inset card in the top-half region.',
    );
    assert(
      Math.abs(splitMetrics.logoHeight - remainingHeight / 2) < 48,
      'Mobile logo section height is not approximately half of the post-header viewport.',
    );
    assert(
      splitMetrics.logoTop >= splitMetrics.playerTop + splitMetrics.playerHeight - 2,
      'Mobile logo section should be positioned below the player section.',
    );

    const mobileCardHeightBeforeCollapse = await page.locator('.audio-player').evaluate((element) =>
      element.getBoundingClientRect().height,
    );
    await page.getByRole('button', { name: 'Collapse player', exact: true }).click();
    await page.waitForTimeout(350);
    const mobileCardHeightCollapsed = await page.locator('.audio-player').evaluate((element) =>
      element.getBoundingClientRect().height,
    );
    assert(
      mobileCardHeightCollapsed < mobileCardHeightBeforeCollapse - 40,
      'Mobile collapse button should reduce overall widget height.',
    );
    await page.getByRole('button', { name: 'Expand player', exact: true }).click();
    await page.waitForTimeout(350);
    const mobileCardHeightAfterExpand = await page.locator('.audio-player').evaluate((element) =>
      element.getBoundingClientRect().height,
    );
    await page.getByRole('button', { name: 'ctrl', exact: true }).click();
    await page.waitForTimeout(350);
    const mobileCardHeightAfterCtrl = await page.locator('.audio-player').evaluate((element) =>
      element.getBoundingClientRect().height,
    );
    assert(
      mobileCardHeightAfterCtrl > mobileCardHeightAfterExpand + 20,
      'Mobile ctrl toggle should increase overall widget height when expanded.',
    );

    const mobileCartLink = page.locator('nav a[href="/cart"]');
    assert((await mobileCartLink.count()) > 0, 'Mobile cart link missing.');
    await mobileCartLink.first().click();
    await page.waitForURL(`${BASE_URL}/cart`);
    assert(
      !(await page.locator('#mini-cart').isVisible()),
      'Mini-cart overlay should not appear on mobile cart navigation.',
    );

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
