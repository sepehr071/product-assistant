// Captures the README screenshots (demo data, no API keys).
//
// 1. Local LiveKit server (https://github.com/livekit/livekit/releases), lk.yaml:
//      port: 4201
//      bind_addresses: [127.0.0.1]
//      rtc: { tcp_port: 4202, udp_port: 4203, use_external_ip: false, node_ip: 127.0.0.1 }
//      keys: { devkey: secretsecretsecretsecretsecretsecret }
//    livekit-server --config lk.yaml
// 2. uv run --with livekit --with livekit-api --with numpy python scripts/demo_agent.py
// 3. cd kiosk && pnpm build && ALLOW_KIOSK_TOKEN=1 LIVEKIT_URL=ws://127.0.0.1:4201 \
//      LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secretsecretsecretsecretsecretsecret \
//      pnpm start -p 4204 -H 127.0.0.1
// 4. node scripts/capture-screenshots.js   (needs `playwright` resolvable and Google Chrome;
//    headless Chromium reports WebRTC "Not supported")
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:4204';
const OUT = process.env.OUT || path.resolve(__dirname, '..', 'docs', 'images');

// Wait until the animated laser sweep is above the viewfinder text, so it does not strike it through.
async function waitForSweepAboveText(page) {
  await page.waitForFunction(() => {
    const sweep = document.querySelector('.laser-sweep');
    const text = [...document.querySelectorAll('p')].find((p) => p.textContent.startsWith('Hold a barcode'));
    return !sweep || !text || sweep.getBoundingClientRect().bottom < text.getBoundingClientRect().top - 24;
  });
}

// Phone layout: bring the conversation box and nutrition ticket into view and start the
// transcript at a message boundary instead of mid-line.
async function showConversation(page) {
  await page.evaluate(() => {
    const box = [...document.querySelectorAll('p')].find((p) => p.textContent.trim() === 'Conversation').parentElement;
    box.closest('.overflow-y-auto').scrollTop += box.getBoundingClientRect().top - 16;
    const content = document.querySelector('[data-slot=message-scroller-content]');
    const scroller = content.parentElement;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const tops = [...content.children].map((c) => c.offsetTop - content.offsetTop).filter((t) => t <= max);
    scroller.scrollTop = Math.max(...tops);
  });
  await page.waitForTimeout(500);
}

async function run({ width, height, idle, talk }) {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  // Microphone only: the camera stays off so the viewfinder shows its idle state.
  await ctx.grantPermissions(['microphone'], { origin: BASE });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (idle) {
    await waitForSweepAboveText(page);
    await page.screenshot({ path: `${OUT}/${idle}` });
  }
  if (talk) {
    await page.getByRole('button', { name: /Greek Yogurt/ }).evaluate((b) => b.click());
    for (const [file, ms, prep] of talk) {
      await page.waitForTimeout(ms);
      if (prep) await prep(page);
      await page.screenshot({ path: `${OUT}/${file}` });
    }
  }
  await browser.close();
}

(async () => {
  await run({
    width: 1440,
    height: 900,
    idle: 'kiosk-idle.png',
    talk: [
      ['kiosk-scanned.png', 3500],
      ['hero.png', 30000],
    ],
  });
  await run({
    width: 390,
    height: 900,
    idle: 'mobile-idle.png',
    talk: [['mobile-talking.png', 34000, showConversation]],
  });
})();
