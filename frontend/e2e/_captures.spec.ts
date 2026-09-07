import { test } from '@playwright/test'

test('captures', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'captures/synthese.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'captures/synthese-mobile.png', fullPage: true })
})
