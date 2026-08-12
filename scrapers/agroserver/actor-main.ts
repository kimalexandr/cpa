/**
 * Apify Actor: Agroserver category → dataset (FactPay-compatible).
 * Вставьте в src/main.ts в Web IDE, затем Build.
 *
 * Input:
 * {
 *   "categoryUrl": "https://agroserver.ru/organo-mineralnye-udobreniya/",
 *   "maxItems": 10
 * }
 */
import { Actor } from 'apify';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

interface Input {
  categoryUrl?: string;
  maxItems?: number;
}

await Actor.main(async () => {
  const input = (await Actor.getInput<Input>()) || {};
  const categoryUrl =
    input.categoryUrl || 'https://agroserver.ru/organo-mineralnye-udobreniya/';
  const maxItems = Number(input.maxItems || 10);

  // Residential proxy помогает обойти капчу (нужен платный/Starter план Apify)
  const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    countryCode: 'RU',
  }).catch(() => undefined);

  const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfiguration as ProxyConfiguration | undefined,
    maxRequestsPerCrawl: 1,
    async requestHandler({ page, log }) {
      await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });

      const captcha = await page.locator('text=не робот').count();
      if (captcha > 0) {
        throw new Error(
          'Agroserver показал капчу. Включите Apify Proxy RESIDENTIAL (Settings / Actor.createProxyConfiguration) или смените тариф.',
        );
      }

      await page.waitForSelector('div.line', { timeout: 30_000 });

      const rows = await page.$$eval(
        'div.line',
        (nodes, limit: number, catUrl: string) => {
          return nodes.slice(0, limit).map((node) => {
            const link = node.querySelector('.th a');
            const href = link ? link.getAttribute('href') || '' : '';
            const title = link ? (link.textContent || '').trim() : '';
            const geoEl = node.querySelector('.bl.geo');
            const textEl = node.querySelector('.text');
            const priceEl = node.querySelector('[class*="price"]');
            const orgEl = node.querySelector('a.personal_org_m, .bl.org a');
            const idMatch = href.match(/-(\d+)\.htm$/);
            return {
              externalId: idMatch ? idMatch[1] : '',
              url: href.startsWith('http') ? href : `https://agroserver.ru${href}`,
              title,
              geo: geoEl ? (geoEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
              description: textEl ? (textEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
              price: priceEl ? (priceEl.textContent || '').replace(/\s+/g, ' ').trim() : null,
              seller: orgEl ? (orgEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
              sourceCategory: catUrl,
            };
          });
        },
        maxItems,
        categoryUrl,
      );

      let saved = 0;
      for (const row of rows) {
        if (!row.externalId || !row.title || !row.url) continue;
        await Actor.pushData(row);
        saved += 1;
      }
      log.info(`Saved ${saved} listings from ${categoryUrl}`);
    },
  });

  await crawler.run([categoryUrl]);
});
