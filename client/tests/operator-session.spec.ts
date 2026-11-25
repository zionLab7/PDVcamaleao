import { expect, test } from '@playwright/test';

test('a supervisor PIN establishes the session used to save fiscal settings', async ({ page }) => {
  const owner = { id: '9ee2cb84-777e-4b56-af5e-e6c3a4702468', name: 'Administrador Teste', role: 'admin' };
  const store = { storeName: 'Loja Teste', receiptWidth: '80mm', enableSound: false };
  await page.addInitScript(() => {
    localStorage.setItem('pdv_access_token', 'tenant-access');
    localStorage.setItem('pdv_refresh_token', 'tenant-refresh');
  });

  let savedAuthorization: string | undefined;
  let refreshedCredential: string | undefined;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/users') return route.fulfill({ json: [owner] });
    if (path === '/api/auth/pin') {
      return route.fulfill({ json: { accessToken: 'owner-access', refreshToken: 'owner-refresh', user: owner } });
    }
    if (path === '/api/auth/refresh') {
      refreshedCredential = request.postDataJSON().refreshToken;
      return route.fulfill({ json: { accessToken: 'renewed-owner-access', refreshToken: 'renewed-owner-refresh' } });
    }
    if (path === '/api/settings' && request.method() === 'PUT') {
      savedAuthorization = request.headers().authorization;
      if (savedAuthorization === 'Bearer owner-access') return route.fulfill({ status: 401, json: { error: 'Sessão expirada' } });
      if (savedAuthorization === 'Bearer renewed-owner-access') return route.fulfill({ json: store });
      return route.fulfill({ status: 403, json: { error: 'Somente administradores e gerentes' } });
    }
    return route.fulfill({ json: path === '/api/settings' ? store : path === '/api/cash-register' ? { isOpen: false, currentBalance: 0, initialAmount: 0, movements: [] } : [] });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Administrador Dono/ }).click();
  for (const digit of ['1', '2', '3', '4']) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar Todas as Configurações', exact: true }).click();
  await expect.poll(() => savedAuthorization).toBe('Bearer renewed-owner-access');
  expect(refreshedCredential).toBe('owner-refresh');
});
