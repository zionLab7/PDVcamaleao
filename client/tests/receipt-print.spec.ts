import { expect, test, type Page } from '@playwright/test';

async function mockPrinter(page: Page) {
  await page.addInitScript(() => {
    const hooked = new WeakSet<HTMLIFrameElement>();
    new MutationObserver(() => {
      for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe[data-thermal-print]')) {
        if (hooked.has(frame)) continue;
        hooked.add(frame);
        const install = () => {
          if (frame.contentWindow) frame.contentWindow.print = () => {
            document.body.dataset.printedWidth = frame.dataset.paperWidth;
          };
        };
        install();
        frame.addEventListener('load', install);
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

for (const width of [58, 80]) {
  for (const fiscal of [false, true]) {
    test(`${width} mm ${fiscal ? 'fiscal' : 'non-fiscal'} receipt is black, legible and unclipped`, async ({ page }) => {
      await page.goto(`/tests/fixtures/receipt.html?width=${width}mm&items=60&fiscal=${fiscal}`);
      const receipt = page.locator('#printable-receipt');
      await expect(page.locator('#receipt-preview')).toBeVisible();
      await expect(receipt).toBeHidden();
      if (fiscal) {
        await expect(receipt.locator('img')).toHaveAttribute('src', /^data:image\/png/);
      }
      // Both targets must contain the exact same sale/fiscal information.
      expect(await receipt.textContent()).toBe(await page.locator('#receipt-preview').textContent());
      await page.emulateMedia({ media: 'print' });
      await expect(receipt).toBeVisible();
      await expect(page.locator('#root')).toBeHidden();
      await expect(receipt).toContainText('PRODUTO 60');
      await expect(receipt).toContainText('R$ 1199,00');
      await expect(receipt).toContainText('Obrigado pela preferência!');
      const layout = await receipt.evaluate(root => {
        const bounds = root.getBoundingClientRect();
        const style = getComputedStyle(root);
        const left = bounds.left + parseFloat(style.paddingLeft);
        const right = bounds.right - parseFloat(style.paddingRight);
        const violations: string[] = [];
        const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (nodes.nextNode()) {
          const text = nodes.currentNode;
          if (!text.textContent?.trim()) continue;
          const parent = text.parentElement!;
          const css = getComputedStyle(parent);
          if (css.color !== 'rgb(0, 0, 0)' || parseFloat(css.fontSize) < 11) {
            violations.push(`contrast/size: ${text.textContent}`);
          }
          const range = document.createRange();
          range.selectNodeContents(text);
          for (const rect of range.getClientRects()) {
            if (rect.left < left - 1 || rect.right > right + 1) {
              violations.push(`overflow: ${text.textContent}`);
            }
          }
        }
        return {
          width: bounds.width, contentWidth: right - left, height: bounds.height,
          scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
          parent: root.parentElement?.tagName, position: style.position, violations,
        };
      });
      expect(layout.parent).toBe('BODY');
      expect(layout.position).toBe('static');
      // Include all padding in the physical limit. The previous 58 mm box had
      // 48 mm content shifted 5 mm right, beyond a 48 mm thermal print head.
      expect(layout.width).toBeCloseTo((width === 58 ? 44 : 68) * 96 / 25.4, 1);
      expect(layout.contentWidth).toBeCloseTo((width === 58 ? 42 : 66) * 96 / 25.4, 1);
      expect(layout.height).toBeGreaterThan(2000);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.violations).toEqual([]);
      if (fiscal) {
        expect(await receipt.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
    });
  }
}

for (const printableWidth of [44, 48]) {
  test(`58 mm receipt fits a ${printableWidth} mm driver area including all text and QR code`, async ({ page }) => {
    await page.goto('/tests/fixtures/receipt.html?width=58mm&items=1&fiscal=true');
    const receipt = page.locator('#printable-receipt');
    await expect(receipt.locator('img')).toHaveAttribute('src', /^data:image\/png/);
    // Emulate the narrow imageable page, instead of only checking a desktop
    // viewport. Some drivers reserve extra margins inside the 58 mm roll.
    const area = Math.floor(printableWidth * 96 / 25.4);
    await page.setViewportSize({ width: area, height: 1800 });
    await page.emulateMedia({ media: 'print' });
    const outside = await receipt.evaluate((root, limit) => {
      const violations: string[] = [];
      const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (nodes.nextNode()) {
        if (!nodes.currentNode.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(nodes.currentNode);
        for (const rect of range.getClientRects()) {
          if (rect.left < -0.5 || rect.right > limit + 0.5) {
            violations.push(nodes.currentNode.textContent!);
          }
        }
      }
      for (const img of root.querySelectorAll('img')) {
        const rect = img.getBoundingClientRect();
        if (rect.left < 0 || rect.right > limit) violations.push('QR code');
      }
      return violations;
    }, area);
    expect(outside).toEqual([]);
    await expect(receipt.locator('.receipt-total')).toContainText('R$ 19,00');
    await expect(receipt.locator('.receipt-amount').last()).toContainText('R$ 6,00');
  });
}

test('cashier can select 58 mm before printing a store configured for 80 mm', async ({ page }) => {
  await mockPrinter(page);
  await page.goto('/tests/fixtures/receipt.html?width=80mm&items=1');
  const receipt = page.locator('#printable-receipt');
  await expect(receipt).toHaveAttribute('data-paper-width', '80mm');
  const selector = page.getByLabel('Bobina deste caixa');
  await selector.selectOption('58mm');
  await selector.press('Enter');
  expect(await page.evaluate(() => document.body.dataset.newSales)).toBeUndefined();
  await expect(receipt).toHaveAttribute('data-paper-width', '58mm');
  await page.getByRole('button', { name: 'Imprimir Cupom (58 mm)', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed-width', '58mm');
  // Opening another sale must not silently restore the store default of 80 mm.
  await page.goto('/tests/fixtures/receipt.html?width=80mm&items=2');
  await expect(selector).toHaveValue('58mm');
  await expect(receipt).toHaveAttribute('data-paper-width', '58mm');
});

for (const width of [58, 80]) {
  for (const items of [1, 60]) {
    test(`actual ${width} mm print document and PDF stay inside the page for ${items} items`, async ({ page, context }, testInfo) => {
      await mockPrinter(page);
      await page.goto(`/tests/fixtures/receipt.html?width=${width}mm&items=${items}&fiscal=true`);
      const print = page.getByRole('button', { name: `Imprimir DANFE NFC-e (${width} mm)`, exact: true });
      await expect(print).toBeEnabled();
      await print.click();
      await expect(page.locator('body')).toHaveAttribute('data-printed-width', `${width}mm`);
      const frame = page.frameLocator('iframe[data-thermal-print]');
      const receipt = frame.locator('#thermal-receipt');
      await expect(receipt).toContainText(`PRODUTO ${items}`);
      await expect(receipt).toContainText(items === 1 ? 'R$ 19,00' : 'R$ 1199,00');
      await expect(receipt).toContainText('Obrigado pela preferência!');
      const geometry = await receipt.evaluate(root => {
        const bounds = root.getBoundingClientRect();
        const left = bounds.left + parseFloat(getComputedStyle(root).paddingLeft);
        const right = bounds.right - parseFloat(getComputedStyle(root).paddingRight);
        const violations: string[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode;
          if (!text.textContent?.trim() || !text.parentElement?.getClientRects().length) continue;
          const css = getComputedStyle(text.parentElement);
          if (css.color !== 'rgb(0, 0, 0)' || parseFloat(css.fontSize) < 11) violations.push('contrast/size');
          const range = document.createRange();
          range.selectNodeContents(text);
          for (const rect of range.getClientRects()) {
            if (rect.left < left - 1 || rect.right > right + 1) violations.push(text.textContent!);
          }
        }
        const amount = root.querySelector('.receipt-total .receipt-amount')!.getBoundingClientRect();
        return { width: bounds.width, amountLeft: amount.left, left, violations };
      });
      expect(geometry.width).toBeCloseTo((width === 58 ? 44 : 68) * 96 / 25.4, 1);
      expect(geometry.amountLeft).toBeCloseTo(geometry.left, 1);
      expect(geometry.violations).toEqual([]);
      // Render exactly the emitted print document with the browser print engine.
      const html = await frame.locator('html').evaluate(el => el.outerHTML);
      const printPage = await context.newPage();
      await printPage.setContent('<!doctype html>' + html);
      const pdf = await printPage.pdf({ path: testInfo.outputPath('actual-print.pdf'), preferCSSPageSize: true, printBackground: true });
      const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(Number(box[1])).toBeCloseTo(width * 72 / 25.4, 0);
        expect(Number(box[2])).toBeLessThanOrEqual(1000 * 72 / 25.4 + 1);
      }
      await testInfo.attach('actual-print.pdf', { body: pdf, contentType: 'application/pdf' });
      await printPage.emulateMedia({ media: 'print' });
      await testInfo.attach('print-layout.png', { body: await printPage.locator('#thermal-receipt').screenshot({ path: testInfo.outputPath('print-layout.png') }), contentType: 'image/png' });
      await printPage.close();
      // Closing the print dialog releases the frame and allows another print.
      await page.evaluate(() => {
        document.querySelector<HTMLIFrameElement>('iframe[data-thermal-print]')!.contentWindow!.dispatchEvent(new Event('afterprint'));
      });
      await expect(page.locator('iframe[data-thermal-print]')).toHaveCount(0);
      await expect(print).toBeEnabled();
    });
  }
}
