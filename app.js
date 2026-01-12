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
function nowIso() { return new Date().toISOString(); }
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
  u.searchParams.forEach((v, k) => (out[k] = v));

  // Hash query too (/#/pay?merchant=...)
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
  try { return JSON.parse(localStorage.getItem(LS_KEYS.RECEIPTS) || "{}") || {}; }
  catch { return {}; }
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
  if (!el) return;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

async function getEthers() {
  return await import("https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm");
}

function hasInjectedWallet() {
  return !!window.ethereum;
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("No wallet found. Open in MetaMask/Trust/Coinbase browser.");
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
  if (!selectEl) return;
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

function validAddress(a) {
  return typeof a === "string" && a.startsWith("0x") && a.length >= 42;
}

/* ------------------------------ POS PAGE (index.html) ------------------------------ */

function initPOSPage() {
  if (!$("posAmount")) return false;

  setText("year", String(new Date().getFullYear()));
  if ($("landingTitle")) setText("landingTitle", `${APP_NAME} Pay`);

  setStatus("good", "POS ready. Enter merchant wallet or connect to auto-fill.");

  const chainSel = $("posChain");
  const tokenSel = $("posToken");
  const merchantInput = $("posMerchant"); // ✅ NEW (add this input in HTML)

  // Fill networks
  const chainOptions = Object.entries(CHAINS).map(([id, c]) => ({ value: id, label: c.name }));
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

  chainSel?.addEventListener("change", () => {
    refreshTokens();
    setPOSHeader($("posAmount")?.value || "", tokenSel.value, Number(chainSel.value));
  });
  tokenSel?.addEventListener("change", () => {
    setPOSHeader($("posAmount")?.value || "", tokenSel.value, Number(chainSel.value));
  });

  // Optional: Connect button to auto-fill merchant
  $("btnConnectMerchant")?.addEventListener("click", async () => {
    try {
      const { account, chainId } = await connectWallet();
      if (merchantInput) merchantInput.value = account;
      setStatus("good", `Merchant wallet set: ${clampAddress(account)} (${CHAINS[chainId]?.name || chainId})`);
    } catch (e) {
      setStatus("bad", e.message || "Wallet error.");
    }
  });

  function buildPOSPayLink({ merchant, amount, tokenKey, chainId, memo }) {
    const base = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}`;
    const qs = new URLSearchParams();
    qs.set("merchant", merchant);
    qs.set("amount", String(amount));
    qs.set("token", tokenKey);
    qs.set("chainId", String(chainId));
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

  $("btnGenerateQR")?.addEventListener("click", () => {
    const merchant = (merchantInput?.value || "").trim();
    const amount = Number($("posAmount")?.value || "");
    const memo = ($("posMemo")?.value || "").trim();
    const chainId = Number(chainSel.value);
    const tokenKey = tokenSel.value;

    if (!validAddress(merchant)) {
      setStatus("bad", "Enter a valid merchant wallet (0x...) or click Connect.");
      return;
    }
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

    const link = buildPOSPayLink({ merchant, amount, tokenKey, chainId, memo });
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

  $("btnNewSale")?.addEventListener("click", () => {
    $("posAmount").value = "";
    $("posMemo").value = "";
    setText("posPayLink", "—");

    const qrBox = $("qrBox");
    if (qrBox) qrBox.innerHTML = `<div class="pos-qr-placeholder">QR will appear here</div>`;

    setPOSHeader("", tokenSel.value, Number(chainSel.value));
    setStatus("good", "New sale ready.");
  });

  setPOSHeader("", tokenSel.value, Number(chainSel.value));
  return true;
}

/* ------------------------------ CREATE LINK PAGE (create.html) ------------------------------ */

function initCreateLinkPage() {
  if (!$("generateLinkBtn")) return false;

  setText("appName", APP_NAME);
  setText("year", String(new Date().getFullYear()));

  const tokenSel = $("token");
  const chainSel = $("network");
  const expiresSel = $("expires");
  const merchantInput = $("merchant");
  const amountInput = $("amount");
  const memoInput = $("memo");

  const chainOptions = Object.entries(CHAINS).map(([id, c]) => ({ value: id, label: c.name }));
  buildSelectOptions(chainSel, chainOptions, DEFAULT_CHAIN_ID);

  const tokenOptions = Object.keys(TOKENS).map((k) => ({ value: k, label: k }));
  buildSelectOptions(tokenSel, tokenOptions, DEFAULT_TOKEN);

  buildSelectOptions(
    expiresSel,
    [
      { value: "15", label: "15 minutes" },
      { value: "30", label: "30 minutes" },
      { value: "60", label: "1 hour" },
      { value: "240", label: "4 hours" },
      { value: "1440", label: "24 hours" },
    ],
    "15"
  );

  function updatePreview() {
    const amount = amountInput.value || "";
    const tokenKey = tokenSel.value || DEFAULT_TOKEN;
    const chainId = Number(chainSel.value || DEFAULT_CHAIN_ID);
    const expiresMin = Number(expiresSel.value || 15);

    const { fee, total } = calcFee(amount);
    const chainName = CHAINS[chainId]?.name || "—";

    setText("pvAmount", `$${fmtMoney(amount)}`);
    setText("pvToken", tokenKey);
    setText("pvNetwork", chainName);
    setText("pvStatus", "Pending");
    setText("pvExpires", `${expiresMin}m`);
    setText("pvFee", `$${fmtMoney(fee)}`);
    setText("pvTotal", `$${fmtMoney(total)}`);
  }

  ["input", "change"].forEach((ev) => {
    tokenSel.addEventListener(ev, updatePreview);
    chainSel.addEventListener(ev, updatePreview);
    expiresSel.addEventListener(ev, updatePreview);
    amountInput.addEventListener(ev, updatePreview);
    memoInput.addEventListener(ev, updatePreview);
    merchantInput.addEventListener(ev, updatePreview);
  });

  $("generateLinkBtn").addEventListener("click", () => {
    const amount = Number(amountInput.value);
    const merchant = (merchantInput.value || "").trim();
    const memo = (memoInput.value || "").trim();
    const tokenKey = tokenSel.value || DEFAULT_TOKEN;
    const chainId = Number(chainSel.value || DEFAULT_CHAIN_ID);
    const expiresMin = Number(expiresSel.value || 15);

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("bad", "Enter a valid amount.");
      return;
    }
    if (!validAddress(merchant)) {
      setStatus("bad", "Enter a valid merchant wallet (0x...).");
      return;
    }
    try {
      ensureChainAndToken(chainId, tokenKey);
    } catch (e) {
      setStatus("bad", e.message);
      return;
    }

    const id = rndId();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + expiresMin * 60_000).toISOString();

    const receipt = {
      id, merchant, amount, token: tokenKey, chainId, memo,
      createdAt, expiresAt, status: "pending", payments: [],
    };

    upsertReceipt(receipt);

    const base = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}`;
    const qs = new URLSearchParams();
    qs.set("merchant", merchant);
    qs.set("amount", String(amount));
    qs.set("token", tokenKey);
    qs.set("chainId", String(chainId));
    if (memo) qs.set("memo", memo);
    qs.set("expiresAt", expiresAt);
    qs.set("rid", id);

    const link = `${base}pay.html?${qs.toString()}`;
    $("shareLink").value = link;
    setText("ridLabel", id);

    setStatus("good", "Link generated ✅");
  });

  $("copyLinkBtn").addEventListener("click", async () => {
    const v = $("shareLink").value;
    if (!v) return;
    await navigator.clipboard.writeText(v);
    setStatus("good", "Copied link.");
  });

  $("openPayBtn").addEventListener("click", () => {
    const v = $("shareLink").value;
    if (!v) return;
    window.open(v, "_blank");
  });

  updatePreview();
  setStatus("good", "Ready.");
  return true;
}

/* ------------------------------ PAY PAGE (pay.html) ------------------------------ */

function initPayPage() {
  if (!$("payBtn")) return false;

  setText("appName", APP_NAME);
  setText("year", String(new Date().getFullYear()));

  const params = parseParams();
  const rid = params.rid || "";
  const urlHasData = !!(params.merchant || params.amount || params.token || params.chainId);
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
    setStatus("warn", "Open a valid payment link (merchant + amount).");
  } else {
    setStatus("good", "Ready to pay.");
  }

  // UI
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

  // ✅ Deep-link helpers (for Safari scan)
  function walletOpenUrl(wallet) {
    const url = window.location.href;
    // iOS deep links:
    if (wallet === "metamask") return `metamask://dapp/${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (wallet === "trust") return `trust://open_url?url=${encodeURIComponent(url)}`;
    if (wallet === "coinbase") return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`;
    return url;
  }

  function showWalletRedirectButtons() {
    const box = $("walletRedirectBox"); // ✅ add this div in pay.html
    if (!box) return;
    box.classList.remove("hidden");

    $("btnOpenMetaMask")?.addEventListener("click", () => { window.location.href = walletOpenUrl("metamask"); });
    $("btnOpenTrust")?.addEventListener("click", () => { window.location.href = walletOpenUrl("trust"); });
    $("btnOpenCoinbase")?.addEventListener("click", () => { window.location.href = walletOpenUrl("coinbase"); });
  }

  if (!hasInjectedWallet()) {
    showWalletRedirectButtons();
  }

  $("connectBtn")?.addEventListener("click", async () => {
    try {
      const { account, chainId } = await connectWallet();
      setText("wallet", clampAddress(account));
      setText("walletChain", CHAINS[chainId]?.name || String(chainId));
      setStatus("good", "Wallet connected.");
    } catch (e) {
      setStatus("bad", e.message || "Wallet error.");
      showWalletRedirectButtons();
    }
  });

  $("payBtn")?.addEventListener("click", async () => {
    try {
      const { ethers, chainId } = await connectWallet();

      const payAmount = Number(form.amount);
      if (!Number.isFinite(payAmount) || payAmount <= 0) throw new Error("Invalid amount.");
      if (!validAddress(form.merchant)) throw new Error("Invalid merchant address.");

      if (form.expiresAt) {
        const exp = new Date(form.expiresAt).getTime();
        if (Date.now() > exp) throw new Error("This payment link expired.");
      }

      const needChainId = Number(form.chainId);
      const { chain, tokenAddress } = ensureChainAndToken(needChainId, form.token);

      if (Number(chainId) !== needChainId) {
        setStatus("warn", `Switching network to ${chain.name}…`);
        await switchChain(needChainId);
      }

      const { signer: signer2, account } = await connectWallet();
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer2);

      // ✅ FIX: use forced decimals per chain (stops tiny amount bug)
      const forcedDecimals = TOKENS[form.token]?.decimals?.[needChainId];
      const decimals = Number.isFinite(forcedDecimals) ? forcedDecimals : await token.decimals();

      const { fee } = calcFee(payAmount);

      const amountUnits = ethers.parseUnits(String(payAmount), decimals);
      const feeUnits = ethers.parseUnits(String(fee), decimals);

      setStatus("warn", "Confirm 2 transactions: merchant payment + treasury fee.");

      const tx1 = await token.transfer(form.merchant, amountUnits);
      setStatus("warn", "Merchant tx sent. Waiting confirmation…");
      const r1 = await tx1.wait();

      const tx2 = await token.transfer(TREASURY_WALLET, feeUnits);
      setStatus("warn", "Fee tx sent. Waiting confirmation…");
      const r2 = await tx2.wait();

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

      if ($("txMerchant")) $("txMerchant").href = link1;
      if ($("txFee")) $("txFee").href = link2;
      $("txBox")?.classList.remove("hidden");

      setStatus("good", "Paid ✅");
    } catch (e) {
      setStatus("bad", e.message || "Payment failed.");
      if (!hasInjectedWallet()) showWalletRedirectButtons();
    }
  });

  return true;
}

/* ------------------------------ BOOT ------------------------------ */

(function boot() {
  if ($("navApp")) $("navApp").textContent = APP_NAME;

  const ok =
    initPOSPage() ||
    initCreateLinkPage() ||
    initPayPage();

  setText("year", String(new Date().getFullYear()));
  if (!ok && $("landingTitle")) {
    setText("landingTitle", `${APP_NAME} Pay`);
  }
})();
