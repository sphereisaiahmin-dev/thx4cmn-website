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
    const desktopPlayerWidth = await page.evaluate(() => {
      const player = document.querySelector('.audio-player');
      return player ? player.getBoundingClientRect().width : null;
    });
    assert(desktopPlayerWidth !== null && desktopPlayerWidth > 0, 'Desktop player width should be measurable.');
    const desktopDotSpacing = await page.evaluate(() => {
      const dots = Array.from(document.querySelectorAll('.audio-player__dot'));
      if (dots.length < 2) return null;
      const firstRect = dots[0].getBoundingClientRect();
      const secondRect = dots[1].getBoundingClientRect();
      return secondRect.left - firstRect.left;
    });
    assert(desktopDotSpacing !== null && desktopDotSpacing > 0, 'Desktop timeline dot spacing should be measurable.');
    const desktopMarqueeState = await page.evaluate(() => {
      const titleViewport = document.querySelector('.audio-player__track-title');
      const titleText = document.querySelector('.audio-player__track-title-text');
      if (!titleViewport || !titleText) return null;
      const overflow = Math.max(titleText.scrollWidth - titleViewport.clientWidth, 0);
      return {
        overflow,
        hasMarquee: titleText.classList.contains('audio-player__track-title-text--marquee'),
      };
    });
    assert(desktopMarqueeState !== null, 'Desktop track title element should exist.');
    assert(
      desktopMarqueeState.hasMarquee === (desktopMarqueeState.overflow > 1),
      'Desktop track title marquee class should only appear when title overflows.',
    );

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
      const dots = Array.from(document.querySelectorAll('.audio-player__dot'));

      const parseColor = (value) => {
        if (!value) return null;
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1]
          .split(',')
          .map((part) => Number.parseFloat(part.trim()))
          .filter((part) => Number.isFinite(part));
        if (parts.length < 3) return null;
        return {
          r: parts[0],
          g: parts[1],
          b: parts[2],
          a: parts[3] ?? 1,
        };
      };

      const playerDotSpacing =
        dots.length >= 2
          ? dots[1].getBoundingClientRect().left - dots[0].getBoundingClientRect().left
          : null;

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
        playerBackgroundRgba: parseColor(playerStyles?.backgroundColor ?? null),
        playerBackdropFilter: playerStyles?.backdropFilter ?? null,
        playerWebkitBackdropFilter: playerStyles?.webkitBackdropFilter ?? null,
        playerDotSpacing,
        playerWidth: playerRect?.width ?? null,
        playerCenterX: playerRect ? playerRect.left + playerRect.width / 2 : null,
        viewportCenterX: window.innerWidth / 2,
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
      mobileChromeMetrics.playerBackgroundRgba !== null &&
        mobileChromeMetrics.playerBackgroundRgba.r <= 24 &&
        mobileChromeMetrics.playerBackgroundRgba.g <= 26 &&
        mobileChromeMetrics.playerBackgroundRgba.b <= 34 &&
        mobileChromeMetrics.playerBackgroundRgba.a > 0 &&
        mobileChromeMetrics.playerBackgroundRgba.a < 1,
      'Mobile player should use dark translucent glass background.',
    );
    assert(
      (mobileChromeMetrics.playerBackdropFilter && mobileChromeMetrics.playerBackdropFilter.includes('blur')) ||
        (mobileChromeMetrics.playerWebkitBackdropFilter &&
          mobileChromeMetrics.playerWebkitBackdropFilter.includes('blur')),
      'Mobile player should keep backdrop blur enabled.',
    );
    assert(
      mobileChromeMetrics.playerDotSpacing !== null &&
        desktopDotSpacing !== null &&
        Math.abs(mobileChromeMetrics.playerDotSpacing - desktopDotSpacing) <= 1.2,
      'Mobile timeline dot spacing should match desktop spacing.',
    );
    assert(
      mobileChromeMetrics.playerWidth !== null &&
        desktopPlayerWidth !== null &&
        Math.abs(mobileChromeMetrics.playerWidth - desktopPlayerWidth) <= 1.5,
      'Mobile player width should match desktop player width.',
    );
    assert(
      mobileChromeMetrics.playerCenterX !== null &&
        mobileChromeMetrics.viewportCenterX !== null &&
        Math.abs(mobileChromeMetrics.playerCenterX - mobileChromeMetrics.viewportCenterX) <= 1.5,
      'Mobile player should be centered horizontally.',
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
      const titleViewport = document.querySelector('.audio-player__track-title');
      const titleText = document.querySelector('.audio-player__track-title-text');
      if (!titleViewport || !titleText) return null;
      const overflow = Math.max(titleText.scrollWidth - titleViewport.clientWidth, 0);
      return {
        overflow,
        hasMarquee: titleText.classList.contains('audio-player__track-title-text--marquee'),
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

    await page.getByRole('button', { name: 'ctrl', exact: true }).click();
    await page.waitForSelector('.audio-player__dsp.is-open');

    await page.waitForFunction(() => {
      const startButton = document.querySelector('button[aria-label="Set loop start"]');
      const endButton = document.querySelector('button[aria-label="Set loop end"]');
      const dots = Array.from(document.querySelectorAll('.audio-player__dot'));
      return Boolean(
        startButton &&
          endButton &&
          !startButton.hasAttribute('disabled') &&
          !endButton.hasAttribute('disabled') &&
          dots.length > 18 &&
          !dots[6].hasAttribute('disabled') &&
          !dots[16].hasAttribute('disabled'),
      );
    });

    const loopStartButton = page.getByRole('button', { name: 'Set loop start', exact: true });
    const loopEndButton = page.getByRole('button', { name: 'Set loop end', exact: true });
    const mobileDots = page.locator('.audio-player__dot');

    await mobileDots.nth(6).click();
    await loopStartButton.click();
    const loopStartState = await page.evaluate(() => ({
      startCount: document.querySelectorAll('.audio-player__dot.loop-marker--start').length,
      bothCount: document.querySelectorAll('.audio-player__dot.loop-marker--both').length,
    }));
    assert(
      loopStartState.startCount + loopStartState.bothCount > 0,
      'Mobile loop start marker should be visible immediately after setting loop start.',
    );

    await mobileDots.nth(16).click();
    await loopEndButton.click();
    const loopVisualState = await page.evaluate(() => {
      const startDots = Array.from(document.querySelectorAll('.audio-player__dot.loop-marker--start'));
      const endDots = Array.from(document.querySelectorAll('.audio-player__dot.loop-marker--end'));
      const sectionDots = Array.from(document.querySelectorAll('.audio-player__dot.loop-section'));
      const plainActiveDot = Array.from(document.querySelectorAll('.audio-player__dot.active')).find(
        (dot) => !dot.classList.contains('loop-marker') && !dot.classList.contains('loop-section'),
      );
      const readStyle = (dot) => {
        if (!dot) return null;
        const styles = window.getComputedStyle(dot);
        return {
          backgroundColor: styles.backgroundColor,
          boxShadow: styles.boxShadow,
        };
      };

      return {
        startCount: startDots.length,
        endCount: endDots.length,
        sectionCount: sectionDots.length,
        markerStyle: readStyle(startDots[0] ?? endDots[0] ?? null),
        sectionStyle: readStyle(sectionDots[0] ?? null),
        plainActiveStyle: readStyle(plainActiveDot ?? null),
      };
    });
    assert(loopVisualState.startCount > 0, 'Mobile timeline should show a loop start marker when loop is set.');
    assert(loopVisualState.endCount > 0, 'Mobile timeline should show a loop end marker when loop is set.');
    assert(loopVisualState.sectionCount > 0, 'Mobile timeline should show highlighted loop section between markers.');
    assert(
      loopVisualState.markerStyle !== null && loopVisualState.markerStyle.boxShadow !== 'none',
      'Mobile loop marker should have distinct visual emphasis.',
    );
    if (loopVisualState.plainActiveStyle && loopVisualState.markerStyle && loopVisualState.sectionStyle) {
      assert(
        loopVisualState.markerStyle.backgroundColor !== loopVisualState.plainActiveStyle.backgroundColor,
        'Loop marker color should differ from plain active dot color on mobile.',
      );
      assert(
        loopVisualState.sectionStyle.backgroundColor !== loopVisualState.plainActiveStyle.backgroundColor,
        'Loop section color should differ from plain active dot color on mobile.',
      );
    }

    await page.waitForTimeout(450);
    const loopCountsAfterDelay = await page.evaluate(() => ({
      startCount: document.querySelectorAll('.audio-player__dot.loop-marker--start').length,
      endCount: document.querySelectorAll('.audio-player__dot.loop-marker--end').length,
      sectionCount: document.querySelectorAll('.audio-player__dot.loop-section').length,
    }));
    assert(
      loopCountsAfterDelay.startCount > 0 &&
        loopCountsAfterDelay.endCount > 0 &&
        loopCountsAfterDelay.sectionCount > 0,
      'Mobile loop timeline visuals should remain stable after being set.',
    );

    // Mobile non-home: compact state should collapse details without unmounting them.
    await page.goto(`${BASE_URL}/store`, { waitUntil: 'networkidle' });
    const mobileOffHomePlayer = page.locator('.audio-player');
    assert((await mobileOffHomePlayer.count()) === 1, 'Mobile non-home route should keep player mounted.');
    assert(await mobileOffHomePlayer.isVisible(), 'Mobile non-home route should keep footer player visible.');
    assert(
      await mobileOffHomePlayer.evaluate((element) => element.classList.contains('audio-player--mobile-compact')),
      'Mobile non-home route should use compact footer player variant.',
    );

    await page.waitForFunction(() => {
      const details = document.querySelector('.audio-player__details');
      if (!details) return false;
      const styles = window.getComputedStyle(details);
      return (
        Number.parseFloat(styles.maxHeight) <= 1 &&
        Number.parseFloat(styles.opacity) <= 0.05 &&
        styles.pointerEvents === 'none'
      );
    });

    const offHomeDetailsState = await page.evaluate(() => {
      const details = document.querySelector('.audio-player__details');
      if (!details) return null;
      const styles = window.getComputedStyle(details);
      const rect = details.getBoundingClientRect();
      return {
        maxHeight: Number.parseFloat(styles.maxHeight),
        opacity: Number.parseFloat(styles.opacity),
        pointerEvents: styles.pointerEvents,
        height: rect.height,
      };
    });
    assert(offHomeDetailsState !== null, 'Mobile non-home should keep details section mounted.');
    assert(
      offHomeDetailsState.maxHeight <= 1 || offHomeDetailsState.height < 2,
      'Mobile non-home details should collapse in compact mode.',
    );
    assert(offHomeDetailsState.opacity <= 0.05, 'Mobile non-home details should be visually hidden in compact mode.');
    assert(offHomeDetailsState.pointerEvents === 'none', 'Compact details should not accept pointer events.');

    const offHomeDots = page.locator('.audio-player__dot');
    assert((await offHomeDots.count()) > 0, 'Mobile non-home should keep timeline controls mounted for animation continuity.');

    const offHomeCtrlToggle = page.locator('.audio-player__dsp-toggle-button');
    assert((await offHomeCtrlToggle.count()) > 0, 'Mobile non-home should keep ctrl toggle mounted for expansion animation.');

    assert((await page.getByRole('button', { name: 'prev', exact: true }).count()) > 0, 'Mobile non-home should keep prev control.');
    assert((await page.getByRole('button', { name: 'play', exact: true }).count()) > 0, 'Mobile non-home should keep play control.');
    assert((await page.getByRole('button', { name: 'next', exact: true }).count()) > 0, 'Mobile non-home should keep next control.');
    assert((await page.locator('.header-now-playing').count()) === 0, 'Mobile header now-playing text should be removed.');

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const mobileReturnHomePlayer = page.locator('.audio-player');
    assert(
      await mobileReturnHomePlayer.evaluate((element) => element.classList.contains('audio-player--mobile-full')),
      'Mobile home route should restore full player variant.',
    );
    await page.waitForFunction(() => {
      const details = document.querySelector('.audio-player__details');
      if (!details) return false;
      const styles = window.getComputedStyle(details);
      return (
        Number.parseFloat(styles.maxHeight) > 100 &&
        Number.parseFloat(styles.opacity) >= 0.9 &&
        styles.pointerEvents !== 'none'
      );
    });

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
