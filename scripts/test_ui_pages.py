#!/usr/bin/env python3
"""
UI Page Navigation Test
=======================
Simulates a user clicking every nav item in the sidebar, then verifies:
  1. The correct page becomes visible  (display != none)
  2. The breadcrumb updates
  3. No JS errors are thrown
  4. For Duty Swap: all 6 sub-page tabs are clickable and switch content

Run:
    python3 scripts/test_ui_pages.py

Requirements:
    pip3 install playwright --break-system-packages
    python3 -m playwright install chromium
"""

import sys, time
from playwright.sync_api import sync_playwright, expect

SERVER  = 'http://localhost:8088'
TIMEOUT = 15_000  # ms per action

# ── Pages to test ─────────────────────────────────────────────────────────────
# (nav_label, page_id, expected_breadcrumb_text, selector_that_must_be_visible)
PAGES = [
    ('Dashboard',          'dashboard',  'DASHBOARD',             '.stats-grid, .dashboard-grid, #page-dashboard'),
    ('Bids Type Analysis', 'bids',       'BIDS TYPE ANALYSIS',    '#page-bids'),
    ('PDF → Excel Converter','converter','PDF → EXCEL CONVERTER', '#page-converter'),
    ('Load SQL into DB',   'loadsql',    'LOAD SQL INTO DB',      '#page-loadsql'),
    ('N-Bids Reformat',    'nbids',      'N-BIDS REFORMAT',       '#page-nbids'),
    ('Us',                 'about',      'ABOUT US',              '#page-about'),
    ('Client',             'client',     'ABOUT CLIENT',          '#page-client'),
    ('Model',              'model',      'ABOUT MODEL',           '#page-model'),
    ('Roadmap',            'roadmap',    'ABOUT ROADMAP',         '#page-roadmap'),
    ('Duty Swap',          'dutyswap',   'DUTY SWAP DEMO',        '#page-dutyswap'),
]

# Duty Swap sub-page tabs
DS_TABS = [
    (1, 'Duty Swap Demo',   '.ds-role-table'),
    (2, 'Controller Setup', '.ds-goal-cards'),
    (3, 'Awarding Setup',   '.ds-goal-cards'),
    (4, 'Crew Portal',      '.ds-carousel-wrap'),
    (5, 'Controller View',  '.ds-ctrl-panel'),
    (6, 'Value Measurement','.ds-value-table'),
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def banner(msg, char='─'):
    print(f'\n{char*56}')
    print(f'  {msg}')
    print(f'{char*56}')

def ok(msg):   print(f'  ✓  {msg}')
def fail(msg): print(f'  ✗  {msg}')

# ── Main test ─────────────────────────────────────────────────────────────────

def run_tests():
    results = {}
    js_errors = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page    = browser.new_page()

        # Capture any JS console errors
        page.on('pageerror', lambda e: js_errors.append(str(e)))
        page.on('console',   lambda m: js_errors.append(m.text) if m.type == 'error' else None)

        # ── Load the app ──────────────────────────────────────────────────────
        banner('Loading app', '═')
        try:
            page.goto(SERVER, timeout=TIMEOUT, wait_until='domcontentloaded')
            page.wait_for_selector('.sidebar', timeout=TIMEOUT)
            ok(f'App loaded at {SERVER}')
        except Exception as e:
            fail(f'Cannot load app: {e}')
            sys.exit(1)

        # ── Test each nav page ────────────────────────────────────────────────
        banner('Testing nav page clicks', '═')

        for nav_label, page_id, expected_bc, visible_sel in PAGES:
            name = f'{nav_label} ({page_id})'
            passed = True

            try:
                # Click the nav item by its label text
                nav_item = page.locator(f'.nav-label:text-is("{nav_label}")').first
                nav_item.click(timeout=TIMEOUT)

                # Wait for the lazy-load fetch to settle
                page.wait_for_timeout(600)
                time.sleep(0.3)   # allow any CSS transitions

                # 1. Page container must be visible
                page_el = page.locator(f'#page-{page_id}')
                display = page_el.evaluate('el => getComputedStyle(el).display')
                if display == 'none':
                    fail(f'{name}: page still hidden (display:none)')
                    passed = False
                else:
                    ok(f'{name}: page visible (display:{display})')

                # 2. Breadcrumb must update
                bc_text = page.locator('#breadcrumb-current').inner_text(timeout=TIMEOUT)
                if expected_bc.upper() in bc_text.upper():
                    ok(f'{name}: breadcrumb = "{bc_text.strip()}"')
                else:
                    fail(f'{name}: breadcrumb expected "{expected_bc}", got "{bc_text.strip()}"')
                    passed = False

                # 3. Nav item gets .active class
                has_active = page.locator(f'.nav-label:text-is("{nav_label}")').locator('..').locator('..').get_attribute('class') or ''
                if 'active' in has_active:
                    ok(f'{name}: nav item marked active')
                else:
                    fail(f'{name}: nav item NOT marked active')
                    passed = False

            except Exception as e:
                fail(f'{name}: EXCEPTION — {e}')
                passed = False

            results[page_id] = passed

        # ── Duty Swap sub-page tabs ───────────────────────────────────────────
        banner('Testing Duty Swap sub-page tabs', '═')

        # Make sure we're on the duty swap page
        ds_nav = page.locator('.nav-label:text-is("Duty Swap")').first
        ds_nav.click(timeout=TIMEOUT)
        page.wait_for_timeout(600)

        ds_results = {}
        for tab_n, tab_name, content_sel in DS_TABS:
            passed = True
            try:
                # Click the tab
                tab_el = page.locator(f'.ds-tab:has-text("{tab_name}")').first
                tab_el.click(timeout=TIMEOUT)
                time.sleep(0.2)

                # Tab must be active
                tab_class = tab_el.get_attribute('class') or ''
                if 'active' not in tab_class:
                    fail(f'Tab {tab_n} "{tab_name}": tab not marked active')
                    passed = False
                else:
                    ok(f'Tab {tab_n} "{tab_name}": tab active')

                # Sub-page must be visible
                sp_el = page.locator(f'#ds-sp-{tab_n}')
                sp_display = sp_el.evaluate('el => getComputedStyle(el).display')
                if sp_display == 'none':
                    fail(f'Tab {tab_n} "{tab_name}": sub-page hidden (display:none)')
                    passed = False
                else:
                    ok(f'Tab {tab_n} "{tab_name}": sub-page visible')

                # Content element must exist
                content_count = page.locator(content_sel).count()
                if content_count > 0:
                    ok(f'Tab {tab_n} "{tab_name}": content present ({content_sel})')
                else:
                    fail(f'Tab {tab_n} "{tab_name}": content NOT found ({content_sel})')
                    passed = False

            except Exception as e:
                fail(f'Tab {tab_n} "{tab_name}": EXCEPTION — {e}')
                passed = False

            ds_results[f'ds_tab_{tab_n}'] = passed

        # ── Carousel arrows on Sub-Page 4 ─────────────────────────────────────
        banner('Testing Crew Portal carousel (Sub-Page 4)', '═')
        try:
            # Click Sub-Page 4 tab
            page.locator('.ds-tab:has-text("Crew Portal")').first.click(timeout=TIMEOUT)
            time.sleep(0.2)

            carousel_passed = True
            for step_n in range(1, 5):   # click → 4 times
                page.locator('#ds-next').click(timeout=TIMEOUT)
                time.sleep(0.15)
                active_idx = page.locator('.ds-child-page.active').evaluate(
                    'el => [...document.querySelectorAll(".ds-child-page")].indexOf(el)'
                )
                if active_idx == step_n:
                    ok(f'Carousel → step {step_n}: child page {step_n} active')
                else:
                    fail(f'Carousel → step {step_n}: expected child {step_n}, got {active_idx}')
                    carousel_passed = False

            # Back to first
            for _ in range(4):
                page.locator('#ds-prev').click(timeout=TIMEOUT)
                time.sleep(0.1)
            first_active = page.locator('.ds-child-page.active').evaluate(
                'el => [...document.querySelectorAll(".ds-child-page")].indexOf(el)'
            )
            if first_active == 0:
                ok('Carousel ← navigated back to child 0')
            else:
                fail(f'Carousel ← back failed: active child = {first_active}')
                carousel_passed = False

            ds_results['ds_carousel'] = carousel_passed

        except Exception as e:
            fail(f'Carousel test EXCEPTION — {e}')
            ds_results['ds_carousel'] = False

        results.update(ds_results)

        # ── JS error check ────────────────────────────────────────────────────
        banner('JS error check', '═')
        if js_errors:
            for e in js_errors:
                fail(f'JS error: {e}')
        else:
            ok('No JS errors detected')

        browser.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    banner('SUMMARY', '═')
    passed_count = sum(1 for v in results.values() if v)
    total_count  = len(results)

    for key, v in results.items():
        status = '✓ PASS' if v else '✗ FAIL'
        print(f'  {status}  {key}')

    print(f'\n  {passed_count}/{total_count} tests passed')

    if js_errors:
        print(f'\n  ⚠  {len(js_errors)} JS error(s) found during run')

    all_ok = (passed_count == total_count) and not js_errors
    print(f'\n  {"ALL TESTS PASSED" if all_ok else "SOME TESTS FAILED"}')
    sys.exit(0 if all_ok else 1)


if __name__ == '__main__':
    run_tests()
