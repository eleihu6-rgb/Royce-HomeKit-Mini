import { test, expect } from '@playwright/test'

test.describe('ROIs Crew Platform smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('loads and shows dashboard', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.topbar')).toBeVisible()
    await expect(page.locator('#breadcrumb-current, .current')).toContainText('DASHBOARD')
  })

  test('navigate to Crew Bids Summary', async ({ page }) => {
    await page.click('text=Crew Bids Summary')
    await expect(page.locator('.current')).toContainText('CREW BIDS SUMMARY')
    // Wait for page to load
    await expect(page.locator('.page-view.active')).toBeVisible()
  })

  test('navigate to PDF Converter', async ({ page }) => {
    await page.click('text=PDF → Excel Converter')
    await expect(page.locator('.current')).toContainText('PDF → EXCEL CONVERTER')
    await expect(page.locator('#upload-zone')).toBeVisible({ timeout: 3000 })
  })

  test('navigate to Bids Type Analysis', async ({ page }) => {
    await page.click('text=Bids Type Analysis')
    await expect(page.locator('.current')).toContainText('BIDS TYPE ANALYSIS')
  })

  test('theme toggle changes badge label', async ({ page }) => {
    const badge = page.locator('.sidebar .nav-badge').filter({ hasText: /DARK|LIGHT/ })
    const before = await badge.textContent()
    await page.click('text=Theme')
    const after = await badge.textContent()
    expect(before).not.toBe(after)
  })

  test('sidebar collapse toggle works', async ({ page }) => {
    await page.click('#sidebarToggleTop')
    await expect(page.locator('.sidebar')).toHaveClass(/collapsed/)
    await page.click('#sidebarToggleTop')
    await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/)
  })

  test('clock shows UTC time', async ({ page }) => {
    const clock = page.locator('.topbar-clock')
    await expect(clock).toContainText('UTC')
  })
})
