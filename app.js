/* ============================================================
   GALLERY — view any Ethereum wallet's NFTs, one piece at a time.
   No login. Shareable via ?address=0x…
   ------------------------------------------------------------
   DATA KEY: This app uses Alchemy's NFT API with their public
   "demo" key, which works with no signup. It is rate-limited
   and meant for light use.

   If the gallery ever shows "rate limited" errors, get a FREE
   personal key in ~2 minutes:
     1. Sign up at https://www.alchemy.com/ (free tier is plenty)
     2. Create an app on Ethereum mainnet, copy its API key
     3. Replace the value below and re-deploy.
   ============================================================ */
const ALCHEMY_KEY = "demo";

const API_BASE = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const PAGE_SIZE = 48;
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

const $ = (id) => document.getElementById(id);
const viewer = $("viewer"), frame = $("frame"), spin = $("spin");

let items = [];          // loaded NFTs in order
let index = 0;           // current position
let nextPageKey = null;
let totalCount = null;
let currentAddress = null;
let loadingMore = false;
let firstLoad = false;

const isValidAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(a || "");
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function resolveImage(nft) {
  // Prefer Alchemy's cached CDN copy (handles IPFS + gateways for us).
  const img = nft.image || {};
  let url = img.cachedUrl || img.thumbnailUrl || img.pngUrl || img.originalUrl
         || (nft.raw && nft.raw.metadata && nft.raw.metadata.image) || "";
  if (typeof url === "string" && url.startsWith("ipfs://")) {
    url = IPFS_GATEWAY + url.slice(7).replace(/^ipfs\//, "");
  }
  const anim = nft.animation || {};
  let animUrl = anim.cachedUrl || anim.originalUrl || "";
  if (typeof animUrl === "string" && animUrl.startsWith("ipfs://")) {
    animUrl = IPFS_GATEWAY + animUrl.slice(7).replace(/^ipfs\//, "");
  }
  return { url, animUrl };
}

function displayName(nft) {
  if (nft.name && nft.name.trim()) return nft.name.trim();
  const cname = (nft.contract && nft.contract.name) || "Untitled";
  return `${cname} #${shortTokenId(nft.tokenId)}`;
}

function shortTokenId(tid) {
  tid = String(tid || "");
  return tid.length > 14 ? tid.slice(0, 6) + "…" + tid.slice(-4) : tid;
}

async function fetchPage(owner, pageKey) {
  const params = new URLSearchParams({ owner, pageSize: PAGE_SIZE, withMetadata: "true" });
  if ($("spam-toggle").checked) params.append("excludeFilters[]", "SPAM");
  if (pageKey) params.append("pageKey", pageKey);
  const res = await fetch(`${API_BASE}/getNFTsForOwner?${params.toString()}`);
  if (res.status === 429) { const e = new Error("rate limited"); e.rateLimited = true; throw e; }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

/* ---------- states ---------- */
function showState(html) {
  frame.innerHTML = `<div class="empty-state">${html}</div>`;
  $("caption").innerHTML = "";
  $("counter").textContent = "";
  $("opensea-link").classList.add("hidden");
  updateArrows();
}
function showWelcome() {
  showState(`<strong>Every wallet is a gallery.</strong>
    Paste any Ethereum address above — no login, no wallet connection —
    and walk through what it holds, one piece at a time.
    <br><button class="chip" data-try="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045">Try: vitalik.eth</button>`);
  bindTryChips();
}
function bindTryChips() {
  frame.querySelectorAll("[data-try]").forEach((el) =>
    el.addEventListener("click", () => viewAddress(el.dataset.try)));
}

/* ---------- loading ---------- */
function viewAddress(address) {
  address = (address || "").trim();
  if (!isValidAddress(address)) {
    items = []; currentAddress = null; firstLoad = false;
    showState(`<strong class="err">That doesn't look like an Ethereum address.</strong>
      <span class="dim">It should be 42 characters starting with 0x.</span>`);
    return;
  }
  currentAddress = address;
  $("address-input").value = address;
  const url = new URL(window.location.href);
  url.searchParams.set("address", address);
  window.history.replaceState({}, "", url);
  items = []; index = 0; nextPageKey = null; totalCount = null; firstLoad = true;
  spin.classList.remove("hidden");
  frame.innerHTML = "";
  $("caption").innerHTML = "";
  (async () => {
    try {
      const data = await fetchPage(address, null);
      items = data.ownedNfts || [];
      nextPageKey = data.pageKey || null;
      totalCount = data.totalCount != null ? Number(data.totalCount) : null;
      spin.classList.add("hidden");
      if (!items.length) {
        showState(`<strong>This wallet holds no NFTs</strong>
          <span class="dim">that this API can see. Try another address.</span>`);
        return;
      }
      show(0);
    } catch (err) {
      spin.classList.add("hidden");
      showState(err.rateLimited
        ? `<strong class="err">Rate limited.</strong>
           <span class="dim">The shared demo key is busy — wait a minute and try again,
           or drop a free personal Alchemy key into app.js.</span>`
        : `<strong class="err">Couldn't load this wallet.</strong>
           <span class="dim">${esc(err.message)} — check the address and try again.</span>`);
    }
  })();
}

async function loadMore() {
  if (loadingMore || !nextPageKey || !currentAddress) return;
  loadingMore = true;
  try {
    const data = await fetchPage(currentAddress, nextPageKey);
    items = items.concat(data.ownedNfts || []);
    nextPageKey = data.pageKey || null;
    updateCounter();
    updateArrows();
  } catch (err) {
    nextPageKey = null; // don't spin forever on failure
  } finally {
    loadingMore = false;
  }
}

/* ---------- viewer ---------- */
function mediaHTML(nft) {
  const { url, animUrl } = resolveImage(nft);
  const alt = esc(displayName(nft));
  if (url) {
    return `<img src="${esc(url)}" alt="${alt}" draggable="false" ` +
      `onerror="this.outerHTML='<div class=&quot;empty-state&quot;><span class=&quot;dim&quot;>image unavailable — the collection&apos;s metadata host may be down</span></div>'">`;
  }
  if (animUrl) return `<video src="${esc(animUrl)}" controls autoplay muted loop playsinline></video>`;
  return `<div class="empty-state"><span class="dim">no image for this piece</span></div>`;
}

function show(i) {
  if (!items.length) return;
  index = Math.max(0, Math.min(i, items.length - 1));
  const nft = items[index];
  frame.innerHTML = mediaHTML(nft);

  const cname = esc((nft.contract && nft.contract.name) || "Unknown collection");
  $("caption").innerHTML =
    `<span class="c-name">${esc(displayName(nft))}</span>` +
    `<span class="c-sub">${cname} · <span class="tok">#${esc(shortTokenId(nft.tokenId))}</span></span>`;
  const os = $("opensea-link");
  os.href = `https://opensea.io/item/ethereum/${nft.contract ? nft.contract.address : ""}/${encodeURIComponent(String(nft.tokenId || ""))}`;
  os.classList.remove("hidden");

  updateCounter();
  updateArrows();
  preload(index + 1); preload(index + 2); preload(index - 1);

  // Seamless pagination: fetch ahead before the user hits the end.
  if (index >= items.length - 4) loadMore();
}

function preload(i) {
  if (i < 0 || i >= items.length) return;
  const { url } = resolveImage(items[i]);
  if (url && !url.startsWith("data:")) { const im = new Image(); im.src = url; }
}

function updateCounter() {
  const total = totalCount != null ? Math.max(totalCount, items.length) : items.length;
  $("counter").textContent = items.length ? `${index + 1} / ${total.toLocaleString()}` : "";
}

function updateArrows() {
  $("prev-btn").disabled = index <= 0;
  $("next-btn").disabled = !items.length || (index >= items.length - 1 && !nextPageKey);
}

function step(d) {
  if (!items.length) return;
  const n = index + d;
  if (n < 0) return;
  if (n >= items.length) {
    if (nextPageKey && !loadingMore) {
      spin.classList.remove("hidden");
      loadMore().then(() => {
        spin.classList.add("hidden");
        if (index < items.length - 1) show(index + 1);
        else updateArrows();
      });
    }
    return;
  }
  show(n);
}

/* ---------- fullscreen ---------- */
$("fs-btn").addEventListener("click", () => {
  if (viewer.requestFullscreen) viewer.requestFullscreen().catch(() => {});
});
$("fs-exit").addEventListener("click", () => {
  if (document.exitFullscreen) document.exitFullscreen();
});
document.addEventListener("fullscreenchange", () => {
  viewer.classList.toggle("is-fs", !!document.fullscreenElement);
});

/* ---------- input ---------- */
$("prev-btn").addEventListener("click", () => step(-1));
$("next-btn").addEventListener("click", () => step(1));

document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "f" || e.key === "F") {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (viewer.requestFullscreen) viewer.requestFullscreen().catch(() => {});
  }
});

// swipe for touch
let touchX = null;
viewer.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
viewer.addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
}, { passive: true });

$("lookup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  viewAddress($("address-input").value);
});
$("spam-toggle").addEventListener("change", () => {
  if (currentAddress) viewAddress(currentAddress);
});
$("share-btn").addEventListener("click", async () => {
  const link = window.location.href;
  try {
    await navigator.clipboard.writeText(link);
    $("share-btn").textContent = "Copied ✓";
  } catch {
    prompt("Copy this link:", link);
    return;
  }
  setTimeout(() => { $("share-btn").textContent = "Copy link"; }, 1800);
});

/* deep link: ?address=0x… */
(() => {
  const q = new URLSearchParams(window.location.search).get("address");
  if (isValidAddress(q)) viewAddress(q);
  else showWelcome();
})();
