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
      expect(layout.width).toBeCloseTo(width * 96 / 25.4, 1);
      expect(layout.contentWidth).toBeCloseTo((width === 58 ? 48 : 72) * 96 / 25.4, 1);
      expect(layout.height).toBeGreaterThan(2000);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.violations).toEqual([]);
      if (fiscal) {
        expect(await receipt.locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
    });
  }
}
