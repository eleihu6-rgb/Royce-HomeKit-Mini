import { useEffect, useRef } from 'react'
import { type PageId } from '../types/nav'

// Cache fetched page HTML to avoid refetching on each navigation
const pageHtmlCache = new Map<PageId, string>()

// Map pageId → the window function to call after HTML is injected
const PAGE_INITS: Partial<Record<PageId, () => void>> = {
  loadsql:            () => (window as any).initLoadSqlPage?.(),
  bids:               () => (window as any).initBidsPage?.(),
  about:              () => (window as any).initAboutMap?.(),
  client:             () => (window as any).initClientMap?.(),
  model:              () => (window as any).initModelPage?.(),
  roadmap:            () => (window as any).initRoadmapPage?.(),
  nbids:              () => (window as any).initNbidsPage?.(),
  'crew-bids-summary':() => (window as any).initCrewBidsSummaryPage?.(),
  converter:          () => (window as any).initConverterPage?.(),
}

interface Props {
  pageId: PageId
}

export default function LegacyPage({ pageId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false

    async function load(container: HTMLDivElement) {
      if (!pageHtmlCache.has(pageId)) {
        const res = await fetch(`pages/${pageId}.html`)
        if (!res.ok || cancelled) return
        pageHtmlCache.set(pageId, await res.text())
      }
      if (cancelled) return

      container.innerHTML = pageHtmlCache.get(pageId)!

      // Call init after the browser has rendered the injected HTML.
      // requestAnimationFrame fires after paint, ensuring listeners attach
      // before any subsequent user interaction (avoids 50ms race under load).
      requestAnimationFrame(() => {
        if (!cancelled) PAGE_INITS[pageId]?.()
      })
    }

    load(el)
    return () => { cancelled = true }
  }, [pageId])

  return <div className="page-view active" ref={containerRef} />
}
