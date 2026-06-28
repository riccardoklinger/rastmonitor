import { NextResponse } from 'next/server'
import { layers, namedTheme } from 'protomaps-themes-base'

/**
 * GET /api/map-style
 *
 * Returns a self-contained MapLibre style JSON.
 * Every URL in this style is relative — no external requests are made by the browser:
 *   /tiles/*   → proxied to Martin (vector tiles from germany.pmtiles)
 *   /fonts/*   → served from web/public/fonts/ (static Next.js assets)
 *   /sprites/* → served from web/public/sprites/ (static Next.js assets)
 *
 * Run scripts/download-map-assets.sh once to populate web/public/fonts/ and
 * web/public/sprites/ before building the Docker image.
 */
export async function GET() {
  const style = {
    version: 8 as const,
    // Fonts served from web/public/fonts/ — no external glyph CDN
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    // Sprites served from web/public/sprites/ — no external sprite CDN
    sprite: '/sprites/v4/light',
    sources: {
      protomaps: {
        type: 'vector' as const,
        // Tile URL is relative → goes through Next.js rewrite → Martin
        // Never leaves the visitor's browser to an external host
        tiles: ['/tiles/germany/{z}/{x}/{y}'],
        minzoom: 0,
        maxzoom: 15,
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      },
    },
    layers: layers('protomaps', namedTheme('light')),
  }

  return NextResponse.json(style, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
