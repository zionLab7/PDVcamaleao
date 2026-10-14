import { expect, test } from '@playwright/test';

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
      expect(layout.width).toBeCloseTo((width === 58 ? 48 : 72) * 96 / 25.4, 1);
      expect(layout.contentWidth).toBeCloseTo((width === 58 ? 46 : 70) * 96 / 25.4, 1);
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
  await page.goto('/tests/fixtures/receipt.html?width=80mm&items=1');
  const receipt = page.locator('#printable-receipt');
  await expect(receipt).toHaveAttribute('data-paper-width', '80mm');
  const selector = page.getByLabel('Bobina para esta impressão');
  await selector.selectOption('58mm');
  await selector.press('Enter');
  expect(await page.evaluate(() => document.body.dataset.newSales)).toBeUndefined();
  await expect(receipt).toHaveAttribute('data-paper-width', '58mm');
  // Check the actual print action uses the selected width.
  await page.evaluate(() => {
    window.print = () => { document.body.dataset.printedWidth = document.querySelector('#printable-receipt')?.getAttribute('data-paper-width') || ''; };
  });
  await page.getByRole('button', { name: 'Imprimir Cupom (58 mm)', exact: true }).click();
  expect(await page.evaluate(() => document.body.dataset.printedWidth)).toBe('58mm');
  await page.emulateMedia({ media: 'print' });
  const box = await receipt.boundingBox();
  expect(box!.width).toBeCloseTo(48 * 96 / 25.4, 1);
});
