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

    // Desktop home: full player + transport correctness.
    await page.waitForSelector('.audio-player__controls button');
    assert((await page.locator('.audio-player').count()) === 1, 'Home page should show the player widget.');

    await page.getByRole('button', { name: 'ctrl', exact: true }).click();
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

    await enterPlayingState(page);
    const playButton = page.getByRole('button', { name: 'play', exact: true });

    const reverseButton = page.getByRole('button', { name: 'reverse', exact: true });
    await reverseButton.click();
    await page.waitForTimeout(300);
    const statusLocator = page.locator('.audio-player__status');
    const statusAfterReverseWhilePlaying = (await statusLocator.count()) > 0 ? await statusLocator.first().textContent() : null;
    assert(statusAfterReverseWhilePlaying !== 'Loading track...', 'Reverse while playing triggered track reload status.');

    await enterPlayingState(page);
    await page.getByRole('button', { name: 'pause', exact: true }).click();
    await playButton.waitFor({ timeout: 3000 });
    await reverseButton.click();
    await page.waitForTimeout(300);
    const statusAfterReversePaused = (await statusLocator.count()) > 0 ? await statusLocator.first().textContent() : null;
    assert(statusAfterReversePaused !== 'Loading track...', 'Reverse while paused triggered track reload status.');

    const titleBefore = await page.locator('.audio-player__track-title').first().textContent();
    await page.getByRole('button', { name: 'next', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'prev', exact: true }).click();
    await page.waitForTimeout(500);
    const titleAfter = await page.locator('.audio-player__track-title').first().textContent();
    assert(titleBefore !== null && titleAfter !== null, 'Track title unavailable for next/prev verification.');

    // Desktop off-home: mounted + collapsed remains unchanged.
    await page.goto(`${BASE_URL}/store`, { waitUntil: 'networkidle' });
    const desktopPlayer = page.locator('.audio-player');
    assert((await desktopPlayer.count()) === 1, 'Desktop non-home route should keep the player mounted.');
    await page.waitForFunction(() => {
      const player = document.querySelector('.audio-player');
      return Boolean(player?.classList.contains('audio-player--collapsed'));
    });
    assert(
      await desktopPlayer.evaluate((element) => element.classList.contains('audio-player--offhome')),
      'Desktop non-home player should use off-home route class.',
    );
    assert((await page.locator('.header-now-playing').count()) === 0, 'Header now-playing label should not be rendered.');

    const desktopCartButton = page.locator('button[aria-controls="mini-cart"]');
    assert((await desktopCartButton.count()) > 0, 'Desktop cart button missing.');
    await desktopCartButton.first().click();
    assert(await page.locator('#mini-cart').isVisible(), 'Desktop mini-cart should open from header cart button.');
    await page.getByRole('button', { name: 'Close cart' }).click();
    await page.waitForTimeout(200);

    // Mobile home: fixed glass header + fixed glass footer player with full controls.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.audio-player');

    const mobileChromeMetrics = await page.evaluate(() => {
      const header = document.querySelector('header');
      const player = document.querySelector('.audio-player');
      const appShell = document.querySelector('.app-shell');
      const appMain = document.querySelector('.app-main');

      const headerRect = header?.getBoundingClientRect();
      const playerRect = player?.getBoundingClientRect();
      const shellStyles = appShell ? window.getComputedStyle(appShell) : null;
      const mainStyles = appMain ? window.getComputedStyle(appMain) : null;
      const headerStyles = header ? window.getComputedStyle(header) : null;
      const playerStyles = player ? window.getComputedStyle(player) : null;

      return {
        headerPosition: headerStyles?.position ?? null,
        playerPosition: playerStyles?.position ?? null,
        headerBackground: headerStyles?.backgroundColor ?? null,
        playerBackground: playerStyles?.backgroundColor ?? null,
        playerBottomGap: playerRect ? window.innerHeight - playerRect.bottom : null,
        shellPaddingTop: shellStyles ? Number.parseFloat(shellStyles.paddingTop) : null,
        headerHeight: headerRect?.height ?? null,
        mainPaddingBottom: mainStyles ? Number.parseFloat(mainStyles.paddingBottom) : null,
        playerHeight: playerRect?.height ?? null,
      };
    });

    assert(mobileChromeMetrics.headerPosition === 'fixed', 'Mobile header should be fixed.');
    assert(mobileChromeMetrics.playerPosition === 'fixed', 'Mobile player should be fixed.');
    assert(
      mobileChromeMetrics.headerBackground !== null && mobileChromeMetrics.headerBackground.includes('255, 255, 255'),
      'Mobile header should keep glass-style translucent white background.',
    );
    assert(
      mobileChromeMetrics.playerBackground !== null && mobileChromeMetrics.playerBackground.includes('255, 255, 255'),
      'Mobile player should match header glass-style translucent white background.',
    );
    assert(
      mobileChromeMetrics.playerBottomGap !== null &&
        mobileChromeMetrics.playerBottomGap >= 0 &&
        mobileChromeMetrics.playerBottomGap < 56,
      'Mobile player should be anchored near the bottom edge.',
    );
    assert(
      mobileChromeMetrics.shellPaddingTop !== null &&
        mobileChromeMetrics.headerHeight !== null &&
        mobileChromeMetrics.shellPaddingTop >= mobileChromeMetrics.headerHeight - 2,
      'Mobile layout should offset content below fixed header.',
    );
    assert(
      mobileChromeMetrics.mainPaddingBottom !== null &&
        mobileChromeMetrics.playerHeight !== null &&
        mobileChromeMetrics.mainPaddingBottom >= mobileChromeMetrics.playerHeight - 2,
      'Mobile layout should offset content above fixed footer player.',
    );

    assert((await page.locator('.audio-player__dot').count()) > 0, 'Mobile home should keep dotted timeline controls.');
    assert((await page.getByRole('button', { name: 'ctrl', exact: true }).count()) > 0, 'Mobile home should show ctrl toggle.');
    assert((await page.locator('.audio-player__collapse-button').count()) === 0, 'Mobile player should not show collapse controls.');

    const marqueeState = await page.evaluate(() => {
      const title = document.querySelector('.audio-player__track-title');
      if (!title) return null;
      const overflow = Math.max(title.scrollWidth - title.clientWidth, 0);
      return {
        overflow,
        hasMarquee: title.classList.contains('audio-player__track-title--marquee'),
      };
    });
    assert(marqueeState !== null, 'Mobile track title element should exist.');
    const isOverflowing = marqueeState.overflow > 1;
    assert(
      marqueeState.hasMarquee === isOverflowing,
      'Track title marquee class should only appear when title overflows.',
    );

    const mobileFooterText = page.locator('footer').getByText(/thx4cmn ©/i);
    const mobileFooterTextVisible =
      (await mobileFooterText.count()) > 0 ? await mobileFooterText.first().isVisible() : false;
    assert(!mobileFooterTextVisible, 'Mobile footer text/content should be hidden.');

    // Mobile non-home: compact transport-only footer player.
    await page.goto(`${BASE_URL}/store`, { waitUntil: 'networkidle' });
    const mobileOffHomePlayer = page.locator('.audio-player');
    assert((await mobileOffHomePlayer.count()) === 1, 'Mobile non-home route should keep player mounted.');
    assert(await mobileOffHomePlayer.isVisible(), 'Mobile non-home route should keep footer player visible.');
    assert(
      await mobileOffHomePlayer.evaluate((element) => element.classList.contains('audio-player--mobile-compact')),
      'Mobile non-home route should use compact footer player variant.',
    );
    assert((await page.locator('.audio-player__dot').count()) === 0, 'Mobile non-home should hide dotted timeline controls.');
    assert((await page.getByRole('button', { name: 'ctrl', exact: true }).count()) === 0, 'Mobile non-home should hide ctrl toggle.');
    assert((await page.getByRole('button', { name: 'prev', exact: true }).count()) > 0, 'Mobile non-home should keep prev control.');
    assert((await page.getByRole('button', { name: 'play', exact: true }).count()) > 0, 'Mobile non-home should keep play control.');
    assert((await page.getByRole('button', { name: 'next', exact: true }).count()) > 0, 'Mobile non-home should keep next control.');
    assert((await page.locator('.header-now-playing').count()) === 0, 'Mobile header now-playing text should be removed.');

    // Mobile cart navigation keeps in-page cart behavior and persistent footer player.
    const mobileCartLink = page.locator('nav a[href="/cart"]');
    assert((await mobileCartLink.count()) > 0, 'Mobile cart link missing.');
    await mobileCartLink.first().click();
    await page.waitForURL(`${BASE_URL}/cart`);
    await page.waitForTimeout(200);
    assert(
      !(await page.locator('#mini-cart').isVisible()),
      'Mini-cart overlay should not appear on mobile cart navigation.',
    );
    assert(await page.locator('.audio-player').isVisible(), 'Mobile cart route should keep footer player visible.');

    // Shuffle behavior payload remains structurally valid.
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
