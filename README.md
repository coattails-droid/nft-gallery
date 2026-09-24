# Gallery — view any wallet's NFTs

A tiny static site: paste any Ethereum address and walk through its NFT
collection one full-frame piece at a time. No login, no wallet connection.
Shareable via `?address=0x…` links.

**Live:** https://coattails-droid.github.io/nft-gallery/

- ← → arrows (or keyboard / swipe) move between pieces
- ⛶ fullscreen button, bottom-right of the viewer (✕ top-right to exit)
- Understated caption: name / collection / token ID, piece counter, OpenSea link

## How it works

- `index.html` + `styles.css` + `app.js` — no build step, no dependencies.
- Data: [Alchemy NFT API](https://www.alchemy.com/) (`getNFTsForOwner`, Ethereum mainnet).
- Uses Alchemy's public `demo` key — works with no signup, but it's rate-limited
  and meant for light use.

## If you hit rate limits

Get a free personal key (~2 minutes):

1. Sign up at https://www.alchemy.com/ (free tier is plenty for this).
2. Create an app on **Ethereum mainnet** and copy its API key.
3. Open `app.js`, replace `const ALCHEMY_KEY = "demo";` with your key, re-deploy.

## Local preview

```bash
cd nft-gallery && python3 -m http.server 8000
# open http://localhost:8000
```
