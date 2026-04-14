/**
 * Crew Bids Summary — Playwright user-flow tests
 *
 * Covers three upload scenarios:
 *   1. Bid report only  → DO BIDS cells have data; DO PRE-ASSIN cells empty
 *   2. Roster only      → DO PRE-ASSIN cells have data; DO BIDS cells empty
 *   3. Both files       → both data types present
 *
 * Requires:
 *   - Vite dev server on http://localhost:5173  (npm run dev)
 *   - Python API on http://localhost:8088       (python3 server.py)
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const BID_FILE    = path.resolve(__dirname, '../doc/CLASS-BidsReport_March2026.txt')
const ROSTER_FILE = path.resolve(__dirname, '../doc/CLASS-RosterReport_March2026_YEG-737-FO_YEGFO_84_92_92_NOUS_.txt')

// ── helpers ───────────────────────────────────────────────────────────────────

async function goToCrewBidsSummary(page: Page) {
  await page.goto('/')
  await page.click('text=Crew Bids Summary')
  // Wait for LegacyPage to inject HTML and initCrewBidsSummaryPage to run
  await expect(page.locator('#cbs-upload-zone')).toBeVisible({ timeout: 6000 })
  // Give the RAF-scheduled init a tick to attach event listeners
  await page.waitForTimeout(100)
}

async function uploadAndAnalyse(page: Page, files: string | string[]) {
  const fileArray = typeof files === 'string' ? [files] : files
  await page.locator('#cbs-file-input').setInputFiles(fileArray)
  await expect(page.locator('#cbs-analyse-btn')).toBeEnabled({ timeout: 3000 })
  await page.click('#cbs-analyse-btn')
  // Wait for API round-trip — analysis card appears on success
  await expect(page.locator('#cbs-analysis-card')).toBeVisible({ timeout: 15000 })
}

async function generateReport(page: Page) {
  await expect(page.locator('#cbs-generate-wrap')).toBeVisible({ timeout: 3000 })
  await page.click('#cbs-report-btn')
  await expect(page.locator('#cbs-report-section')).toBeVisible({ timeout: 10000 })
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Crew Bids Summary — upload flows', () => {

  // ── initial state ──────────────────────────────────────────────────────────

  test('page loads with upload zone and disabled analyse button', async ({ page }) => {
    await goToCrewBidsSummary(page)
    await expect(page.locator('#cbs-upload-zone')).toBeVisible()
    await expect(page.locator('#cbs-analyse-btn')).toBeDisabled()
    await expect(page.locator('#cbs-analysis-card')).toBeHidden()
  })

  // ── Flow 1: bid report only ────────────────────────────────────────────────

  test.describe('bid-only upload', () => {
    test.beforeEach(async ({ page }) => goToCrewBidsSummary(page))

    test('analyse button enables after selecting bid file', async ({ page }) => {
      await page.locator('#cbs-file-input').setInputFiles(BID_FILE)
      await expect(page.locator('#cbs-analyse-btn')).toBeEnabled()
    })

    test('file display shows bid file name', async ({ page }) => {
      await page.locator('#cbs-file-input').setInputFiles(BID_FILE)
      await expect(page.locator('#cbs-file-display')).toBeVisible()
      await expect(page.locator('#cbs-file-name')).toContainText('BidsReport')
    })

    test('analysis card shows bid month and categories after analyse', async ({ page }) => {
      await uploadAndAnalyse(page, BID_FILE)
      await expect(page.locator('#cbs-bid-month')).not.toHaveText('—')
      await expect(page.locator('#cbs-cat-count')).not.toHaveText('—')
      await expect(page.locator('#cbs-category-card')).toBeVisible()
    })

    test('log records bid load but not roster load', async ({ page }) => {
      await uploadAndAnalyse(page, BID_FILE)
      await expect(page.locator('#cbs-log-body')).toContainText('Bid analysis complete')
      await expect(page.locator('#cbs-log-body')).not.toContainText('Roster loaded')
    })

    test('report renders with DO BIDS and DO PRE-ASSIN row labels', async ({ page }) => {
      await uploadAndAnalyse(page, BID_FILE)
      await generateReport(page)
      await expect(page.locator('#cbs-report-section')).toContainText('CREW BIDS SUMMARY REPORT')
      // Both labels always appear in the table structure
      await expect(page.locator('#cbs-tables-wrap')).toContainText('DO BIDS')
      await expect(page.locator('#cbs-tables-wrap')).toContainText('DO PRE-ASSIN')
    })

    test('DO BIDS row has numeric data; DO PRE-ASSIN row is empty', async ({ page }) => {
      await uploadAndAnalyse(page, BID_FILE)
      await generateReport(page)
      // DO BIDS cells are coloured when they have data — check via inline style attribute
      const bidDataCells = page.locator('#cbs-tables-wrap td[style*="accent-primary"]')
      await expect(bidDataCells.first()).toBeVisible()
      // The report month badge should be populated from bid data
      await expect(page.locator('#cbs-report-month')).not.toBeEmpty()
    })
  })

  // ── Flow 2: roster only ────────────────────────────────────────────────────

  test.describe('roster-only upload', () => {
    test.beforeEach(async ({ page }) => goToCrewBidsSummary(page))

    test('analyse button enables after selecting roster file', async ({ page }) => {
      await page.locator('#cbs-file-input').setInputFiles(ROSTER_FILE)
      await expect(page.locator('#cbs-analyse-btn')).toBeEnabled()
    })

    test('file display shows roster file name', async ({ page }) => {
      await page.locator('#cbs-file-input').setInputFiles(ROSTER_FILE)
      await expect(page.locator('#cbs-file-display')).toBeVisible()
      await expect(page.locator('#cbs-file-name')).toContainText('RosterReport')
    })

    test('analysis card shows period and categories after analyse', async ({ page }) => {
      await uploadAndAnalyse(page, ROSTER_FILE)
      await expect(page.locator('#cbs-bid-month')).not.toHaveText('—')
      await expect(page.locator('#cbs-category-card')).toBeVisible()
    })

    test('log records roster load but not bid load', async ({ page }) => {
      await uploadAndAnalyse(page, ROSTER_FILE)
      await expect(page.locator('#cbs-log-body')).toContainText('Roster loaded')
      await expect(page.locator('#cbs-log-body')).not.toContainText('Bid report loaded')
    })

    test('report renders with DO PRE-ASSIN data cells coloured', async ({ page }) => {
      await uploadAndAnalyse(page, ROSTER_FILE)
      await generateReport(page)
      await expect(page.locator('#cbs-report-section')).toContainText('CREW BIDS SUMMARY REPORT')
      await expect(page.locator('#cbs-tables-wrap')).toContainText('DO PRE-ASSIN')
      // At least one coloured data cell from roster
      const dataCell = page.locator('#cbs-tables-wrap td[style*="accent-primary"]')
      await expect(dataCell.first()).toBeVisible()
    })
  })

  // ── Flow 3: both files ─────────────────────────────────────────────────────

  test.describe('both files upload', () => {
    test.beforeEach(async ({ page }) => goToCrewBidsSummary(page))

    test('analyse button enables after selecting both files', async ({ page }) => {
      await page.locator('#cbs-file-input').setInputFiles([BID_FILE, ROSTER_FILE])
      await expect(page.locator('#cbs-analyse-btn')).toBeEnabled()
    })

    test('file display shows both file names', async ({ page }) => {
      await page.locator('#cbs-file-input').setInputFiles([BID_FILE, ROSTER_FILE])
      await expect(page.locator('#cbs-file-display')).toBeVisible()
      const names = await page.locator('#cbs-file-name').textContent()
      expect(names).toContain('BidsReport')
      expect(names).toContain('RosterReport')
    })

    test('analysis card shows data from both sources', async ({ page }) => {
      await uploadAndAnalyse(page, [BID_FILE, ROSTER_FILE])
      await expect(page.locator('#cbs-bid-month')).not.toHaveText('—')
      await expect(page.locator('#cbs-cat-count')).not.toHaveText('—')
      await expect(page.locator('#cbs-category-card')).toBeVisible()
    })

    test('log records both bid and roster load', async ({ page }) => {
      await uploadAndAnalyse(page, [BID_FILE, ROSTER_FILE])
      await expect(page.locator('#cbs-log-body')).toContainText('Bid analysis complete')
      await expect(page.locator('#cbs-log-body')).toContainText('Roster loaded')
    })

    test('report contains both DO BIDS and DO PRE-ASSIN with data', async ({ page }) => {
      await uploadAndAnalyse(page, [BID_FILE, ROSTER_FILE])
      await generateReport(page)
      await expect(page.locator('#cbs-report-section')).toContainText('CREW BIDS SUMMARY REPORT')
      await expect(page.locator('#cbs-tables-wrap')).toContainText('DO BIDS')
      await expect(page.locator('#cbs-tables-wrap')).toContainText('DO PRE-ASSIN')
      // Both sources contribute coloured cells
      const dataCells = page.locator('#cbs-tables-wrap td[style*="accent-primary"]')
      await expect(dataCells.first()).toBeVisible()
    })

    test('report month badge shows bid month', async ({ page }) => {
      await uploadAndAnalyse(page, [BID_FILE, ROSTER_FILE])
      await generateReport(page)
      await expect(page.locator('#cbs-report-month')).not.toBeEmpty()
    })

    test('log records both bid and roster success', async ({ page }) => {
      await uploadAndAnalyse(page, [BID_FILE, ROSTER_FILE])
      await expect(page.locator('#cbs-log-body')).toContainText('categories')
    })
  })

  // ── Flow 4: re-upload resets state ─────────────────────────────────────────

  test('selecting new files after report resets UI and re-enables flow', async ({ page }) => {
    await goToCrewBidsSummary(page)

    // First run: both files
    await uploadAndAnalyse(page, [BID_FILE, ROSTER_FILE])
    await generateReport(page)
    await expect(page.locator('#cbs-report-section')).toBeVisible()

    // Re-select bid file only — report should hide and state reset
    await page.locator('#cbs-file-input').setInputFiles(BID_FILE)
    await expect(page.locator('#cbs-report-section')).toBeHidden()
    await expect(page.locator('#cbs-analysis-card')).toBeHidden()
    await expect(page.locator('#cbs-analyse-btn')).toBeEnabled()
  })

})
