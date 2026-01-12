import {
  APP_NAME,
  TREASURY_WALLET,
  FEE_BPS,
  CHAINS,
  TOKENS,
  DEFAULT_CHAIN_ID,
  DEFAULT_TOKEN,
  LS_KEYS
} from "./config.js";

// Minimal ERC20 ABI
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const $ = (id) => document.getElementById(id);

function fmtMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
function clampAddress(addr) {
  if (!addr) return "";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
function nowIso() {
  return new Date().toISOString();
}
function rndId() {
  return (
    "OLY-" +
    Math.random().toString(16).slice(2, 6).toUpperCase() +
    "-" +
    Math.random().toString(16).slice(2, 6).toUpperCase()
  );
}
function parseParams() {
  const u = new URL(window.location.href);
  const out = {};
  // Normal query (?a=b)
  u.searchParams.forEach((v, k) => (out[k] = v));

  // Hash query (/#/pay?merchant=...)
  const h = u.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex >= 0) {
    const qs = h.slice(qIndex + 1);
    const hp = new URLSearchParams(qs);
    hp.forEach((v, k) => (out[k] = v));
  }
  return out;
}

function readReceipts() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.RECEIPTS) || "{}") || {};
  } catch {
    return {};
  }
}
function writeReceipts(obj) {
  localStorage.setItem(LS_KEYS.RECEIPTS, JSON.stringify(obj));
}
function upsertReceipt(receipt) {
  const all = readReceipts();
  all[receipt.id] = receipt;
  writeReceipts(all);
  return receipt;
}
function getReceipt(id) {
  const all = readReceipts();
  return all[id] || null;
}

function calcFee(amount) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return { fee: 0, total: 0 };
  const fee = (a * FEE_BPS) / 10000;
  const total = a + fee;
  return { fee, total };
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = value;
}
function setStatus(kind, msg) {
  const el = $("status");
  if (!el) return; // safe if status doesn't exist on a page
  el.className = `status ${kind}`;
  el.textContent = msg;
}

async function getEthers() {
  return await import("https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm");
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("No wallet found (MetaMask).");
  const { ethers } = await getEthers();
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const account = await signer.getAddress();
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  return { ethers, provider, signer, account, chainId };
}

async function switchChain(chainId) {
  const hex = "0x" + Number(chainId).toString(16);
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hex }],
  });
}

function buildSelectOptions(selectEl, items, selected) {
  selectEl.innerHTML = "";
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = String(it.value);
    opt.textContent = it.label;
    if (String(it.value) === String(selected)) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function ensureChainAndToken(chainId, tokenKey) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error("Unsupported network in this demo.");
  const token = TOKENS[tokenKey];
  if (!token) throw new Error("Unsupported token.");
  const addr = token.addresses[chainId];
  if (!addr) throw new Error(`${tokenKey} not available on ${chain.name} in this demo.`);
  return { chain, token, tokenAddress: addr };
}

/* ------------------------------ POS PAGE (INDEX) ------------------------------ */

function initPOSPage() {
  // Only run on POS page (index.html)
  if (!$("posAmount")) return false;

  setText("year", String(new Date().getFullYear()));
  if ($("landingTitle")) setText("landingTitle", `${APP_NAME} Pay`);

  const merchantInput = $("posMerchant");
  const chainSel = $("posChain");
  const tokenSel = $("posToken");

  // Fill ALL networks from config (CHAINS uses chainId keys)
  const chainOptions = Object.entries(CHAINS).map(([id, c]) => ({
    value: id,
    label: c.name,
  }));

  const defaultChain = String(DEFAULT_CHAIN_ID || chainOptions[0]?.value || "");
  buildSelectOptions(chainSel, chainOptions, defaultChain);

  function refreshTokens() {
    const chainId = Number(chainSel.value);
    const tokenOptions = Object.keys(TOKENS)
      .filter((k) => !!TOKENS[k]?.addresses?.[chainId])
      .map((k) => ({ value: k, label: k }));

    const preferred =
      tokenOptions.find((t) => t.value === DEFAULT_TOKEN)?.value ||
      tokenOptions[0]?.value ||
      DEFAULT_TOKEN;

    buildSelectOptions(tokenSel, tokenOptions, preferred);
  }

  refreshTokens();

  function setPOSHeader(amount, tokenKey, chainId) {
    setText("posDisplayAmount", amount ? `$${fmtMoney(amount)}` : "$0.00");
    const chainName = CHAINS[Number(chainId)]?.name || "—";
    setText("posDisplaySub", `${tokenKey || "—"} • ${chainName}`);
  }

  chainSel.addEventListener("change", () => {
    refreshTokens();
    setPOSHeader($("posAmount")?.value || "", tokenSel.value, Number(chainSel.value));
  });

  tokenSel.addEventListener("change", () => {
    setPOSHeader($("posAmount")?.value || "", tokenSel.value, Number(chainSel.value));
  });

  // Wallet modal open/close (optional)
  const backdrop = $("walletModalBackdrop");
  const openBtn = $("btnOpenWalletModal");
  const closeBtn = $("walletModalClose");

  function openModal() { backdrop?.classList.add("show"); }
  function closeModal() { backdrop?.classList.remove("show"); }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  // Optional: connect wallet to auto-fill merchant address
  let connectedWallet = "";
  const walletPill = $("walletPill");

  async function connectAndFill() {
    try {
      const { account, chainId } = await connectWallet();
      connectedWallet = account;

      if (merchantInput) merchantInput.value = account;

      if (walletPill) {
        walletPill.style.display = "inline-flex";
        walletPill.textContent = clampAddress(account);
      }

      setStatus("good", `Connected (${CHAINS[chainId]?.name || chainId}). Address filled ✅`);
    } catch (e) {
      setStatus("bad", e.message || "Wallet error.");
    }
  }

  $("btnUseConnected")?.addEventListener("click", () => {
    // if in normal browser with no wallet, this will fail safely
    connectAndFill();
  });

  // Wallet cards: only injected wired for now
  document.querySelectorAll(".wallet-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const type = card.getAttribute("data-wallet") || "";
      closeModal();

      if (type !== "injected") {
        setStatus("warn", "WalletConnect/Coinbase/Trust not configured yet. Use MetaMask for now.");
        return;
      }
      await connectAndFill();
    });
  });

  function buildPOSPayLink({ merchant, amount, tokenKey, chainId, memo, staticOnly }) {
    const base = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}`;
    const qs = new URLSearchParams();
    qs.set("merchant", merchant);
    qs.set("token", tokenKey);
    qs.set("chainId", String(chainId));
    if (!staticOnly) qs.set("amount", String(amount));
    if (memo) qs.set("memo", memo);
    return `${base}pay.html?${qs.toString()}`;
  }

  function renderQR(link) {
    const qrBox = $("qrBox");
    if (!qrBox) return;

    qrBox.innerHTML = "";
    if (typeof QRCode === "undefined") {
      qrBox.innerHTML = `<div class="pos-qr-placeholder">QR library missing</div>`;
      return;
    }

    // eslint-disable-next-line no-undef
    new QRCode(qrBox, { text: link, width: 260, height: 260 });
  }

  function getMerchant() {
    const m = (merchantInput?.value || "").trim();
    return m;
  }

  function validateMerchant(m) {
    return m && m.startsWith("0x") && m.length >= 40;
  }

  // Recent payments local (frontend-only)
  const RECENT_KEY = "olynt_pos_recent";

  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") || []; }
    catch { return []; }
  }
  function saveRecent(list) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }
  function renderRecent() {
    const box = $("recentPayments");
    if (!box) return;

    const list = loadRecent().slice().reverse();
    if (!list.length) {
      box.textContent = "No payments saved yet.";
      return;
    }

    box.innerHTML = list.map((p) => {
      const d = new Date(p.ts).toLocaleString();
      const chainName = CHAINS[p.chainId]?.name || String(p.chainId);
      return `
        <div class="mono small" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">
          <div><b>${p.token}</b> • $${fmtMoney(p.amount)} • ${chainName}</div>
          <div>${p.tx}</div>
          <div class="muted">${d}</div>
        </div>
      `;
    }).join("");
  }

  renderRecent();

  // STATIC QR (ONE TIME FOREVER)
  $("btnStaticQR")?.addEventListener("click", () => {
    const merchant = getMerchant();
    const chainId = Number(chainSel.value);
    const tokenKey = tokenSel.value;

    if (!validateMerchant(merchant)) {
      setStatus("bad", "Enter a valid merchant wallet (0x...). No wallet connection needed.");
      return;
    }

    try {
      ensureChainAndToken(chainId, tokenKey);
    } catch (e) {
      setStatus("bad", e.message);
      return;
    }

    const link = buildPOSPayLink({
      merchant,
      amount: 0,
      tokenKey,
      chainId,
      memo: "",
      staticOnly: true
    });

    setPOSHeader("", tokenKey, chainId);
    setText("posPayLink", link);
    renderQR(link);
    setStatus("good", "Static QR ready ✅ (1 QR forever). Customer will enter amount in wallet.");
  });

  // DYNAMIC QR (PER SALE AMOUNT)
  $("btnGenerateQR")?.addEventListener("click", () => {
    const merchant = getMerchant();
    if (!validateMerchant(merchant)) {
      setStatus("bad", "Enter your merchant wallet (0x...) first. No wallet connection needed.");
      return;
    }

    const amount = Number($("posAmount")?.value || "");
    const memo = ($("posMemo")?.value || "").trim();
    const chainId = Number(chainSel.value);
    const tokenKey = tokenSel.value;

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("bad", "Enter a valid amount.");
      return;
    }

    try {
      ensureChainAndToken(chainId, tokenKey);
    } catch (e) {
      setStatus("bad", e.message);
      return;
    }

    const link = buildPOSPayLink({
      merchant,
      amount,
      tokenKey,
      chainId,
      memo,
      staticOnly: false
    });

    setPOSHeader(amount, tokenKey, chainId);
    setText("posPayLink", link);
    renderQR(link);
    setStatus("good", "QR ready ✅ Customer can scan and pay.");
  });

  $("btnCopyPayLink")?.addEventListener("click", async () => {
    const link = $("posPayLink")?.textContent || "";
    if (!link || link === "—") return;
    await navigator.clipboard.writeText(link);
    setStatus("good", "Copied link.");
  });

  $("btnSavePayment")?.addEventListener("click", () => {
    const tx = ($("posTxHash")?.value || "").trim();
    if (!tx.startsWith("0x") || tx.length < 10) {
      setStatus("bad", "Paste a valid tx hash (0x...).");
      return;
    }

    const amount = Number($("posAmount")?.value || 0);
    const chainId = Number(chainSel.value);
    const tokenKey = tokenSel.value;

    const list = loadRecent();
    list.push({ tx, amount, chainId, token: tokenKey, ts: Date.now() });
    saveRecent(list);

    $("posTxHash").value = "";
    renderRecent();
    setStatus("good", "Saved ✅");
  });

  $("btnNewSale")?.addEventListener("click", () => {
    $("posAmount").value = "";
    $("posMemo").value = "";
    $("posTxHash").value = "";
    setText("posPayLink", "—");

    const qrBox = $("qrBox");
    if (qrBox) qrBox.innerHTML = `<div class="pos-qr-placeholder">QR will appear here</div>`;

    setPOSHeader("", tokenSel.value, Number(chainSel.value));
    setStatus("good", "New sale ready.");
  });

  // initial header
  setPOSHeader("", tokenSel.value, Number(chainSel.value));
  setStatus("good", "POS ready ✅ Enter merchant wallet to generate QR.");

  return true;
}

/* ------------------------------ PAY PAGE ------------------------------ */

function initPayPage() {
  if (!$("payBtn")) return false;

  setText("appName", APP_NAME);
  setText("year", String(new Date().getFullYear()));

  const params = parseParams();

  // URL-based receipts (works on any device)
  const rid = params.rid || "";
  const urlHasData = !!(params.merchant || params.amount || params.token || params.chainId);

  // Optional: still support localStorage receipts if rid exists and URL doesn't include full data
  const receipt = (!urlHasData && rid) ? getReceipt(rid) : null;

  const form = {
    rid,
    chainId: Number(params.chainId || receipt?.chainId || DEFAULT_CHAIN_ID),
    token: (params.token || receipt?.token || DEFAULT_TOKEN),
    amount: (params.amount || receipt?.amount || ""),
    merchant: (params.merchant || receipt?.merchant || ""),
    memo: (params.memo || receipt?.memo || ""),
    expiresAt: (params.expiresAt || receipt?.expiresAt || ""),
  };

  if (!form.merchant || !form.amount) {
    setStatus("warn", "Open a valid payment link (merchant + amount). You can generate one in Create Link.");
  } else {
    setStatus("good", "Ready to pay.");
  }

  // Populate UI
  setText("rid", form.rid || "—");
  setText("merchantPreview", form.merchant ? clampAddress(form.merchant) : "—");
  setText("memoPreview", form.memo || "—");
  setText("expiresPreview", form.expiresAt ? new Date(form.expiresAt).toLocaleString() : "—");

  const chainName = CHAINS[Number(form.chainId)]?.name || "—";
  setText("networkPreview", chainName);
  setText("tokenPreview", form.token);
  setText("amountPreview", `$${fmtMoney(form.amount)}`);

  const { fee, total } = calcFee(form.amount);
  setText("feePreview", `$${fmtMoney(fee)}`);
  setText("totalPreview", `$${fmtMoney(total)}`);

  $("connectBtn").addEventListener("click", async () => {
    try {
      const { account, chainId } = await connectWallet();
      setText("wallet", clampAddress(account));
      setText("walletChain", CHAINS[chainId]?.name || String(chainId));
      setStatus("good", "Wallet connected.");
    } catch (e) {
      setStatus("bad", e.message || "Wallet error.");
    }
  });

  $("payBtn").addEventListener("click", async () => {
    try {
      const { ethers, signer, account, chainId } = await connectWallet();

      // Validate
      const payAmount = Number(form.amount);
      if (!Number.isFinite(payAmount) || payAmount <= 0) throw new Error("Invalid amount.");
      if (!form.merchant || !form.merchant.startsWith("0x")) throw new Error("Invalid merchant address.");

      // Expiry check
      if (form.expiresAt) {
        const exp = new Date(form.expiresAt).getTime();
        if (Date.now() > exp) throw new Error("This payment link expired.");
      }

      // Ensure token exists
      const needChainId = Number(form.chainId);
      const { chain, tokenAddress } = ensureChainAndToken(needChainId, form.token);

      // Switch network if needed
      if (Number(chainId) !== needChainId) {
        setStatus("warn", `Switching network to ${chain.name}…`);
        await switchChain(needChainId);
      }

      // Reconnect after switch
      const { signer: signer2 } = await connectWallet();
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer2);
      const decimals = await token.decimals();

      const { fee } = calcFee(payAmount);

      const amountUnits = ethers.parseUnits(String(payAmount), decimals);
      const feeUnits = ethers.parseUnits(String(fee), decimals);

      setStatus("warn", "Confirm 2 transactions: merchant payment + treasury fee.");

      // 1) Pay merchant
      const tx1 = await token.transfer(form.merchant, amountUnits);
      setStatus("warn", "Merchant tx sent. Waiting confirmation…");
      const r1 = await tx1.wait();

      // 2) Pay treasury
      const tx2 = await token.transfer(TREASURY_WALLET, feeUnits);
      setStatus("warn", "Fee tx sent. Waiting confirmation…");
      const r2 = await tx2.wait();

      // Update receipt (if exists)
      if (receipt) {
        receipt.status = "paid";
        receipt.paidAt = nowIso();
        receipt.payer = account;
        receipt.payments = [
          { type: "merchant", tx: r1.hash, to: form.merchant, amount: payAmount },
          { type: "fee", tx: r2.hash, to: TREASURY_WALLET, amount: fee },
        ];
        upsertReceipt(receipt);
      }

      const link1 = chain.explorerTx(r1.hash);
      const link2 = chain.explorerTx(r2.hash);

      $("txMerchant").href = link1;
      $("txFee").href = link2;
      $("txBox").classList.remove("hidden");

      setStatus("good", "Paid ✅");
    } catch (e) {
      setStatus("bad", e.message || "Payment failed.");
    }
  });

  return true;
}

/* ------------------------------ BOOT ------------------------------ */

(function boot() {
  // Update nav app name if present
  if ($("navApp")) $("navApp").textContent = APP_NAME;

  const ok =
    initPOSPage() ||
    initCreateLinkPage() ||
    initPayPage();

  // Landing page: just set footer year
  setText("year", String(new Date().getFullYear()));
  if (!ok && $("landingTitle")) {
    setText("landingTitle", `${APP_NAME} Pay`);
  }
})();
