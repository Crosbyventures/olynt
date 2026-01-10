import { APP_NAME, TREASURY_WALLET, FEE_BPS, CHAINS, TOKENS, DEFAULT_CHAIN_ID, DEFAULT_TOKEN, LS_KEYS } from "./config.js";

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
  return "OLY-" + Math.random().toString(16).slice(2, 6).toUpperCase() + "-" + Math.random().toString(16).slice(2, 6).toUpperCase();
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
  if (!el) return;
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

/* ---------------------------- CREATE LINK PAGE ---------------------------- */

function initCreateLinkPage() {
  if (!$("generateLinkBtn")) return false;

  // Fill header/footer bits
  setText("appName", APP_NAME);
  setText("year", String(new Date().getFullYear()));

  // Defaults
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

  buildSelectOptions(expiresSel, [
    { value: "15", label: "15 minutes" },
    { value: "30", label: "30 minutes" },
    { value: "60", label: "1 hour" },
    { value: "240", label: "4 hours" },
    { value: "1440", label: "24 hours" },
  ], "15");

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

  ["input","change"].forEach((ev) => {
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
    if (!merchant || !merchant.startsWith("0x") || merchant.length < 40) {
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
      id,
      merchant,
      amount,
      token: tokenKey,
      chainId,
      memo,
      createdAt,
      expiresAt,
      status: "pending",
      payments: [],
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
    qs.set("rid", id); // optional display id
    const link = `${base}pay.html?${qs.toString()}`;
    $("shareLink").value = link;
    setText("ridLabel", id);

    setStatus("good", "Link generated ✅ (works on any device).");
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
  setStatus("good", "Ready. Share the link on WhatsApp/Telegram.");
  return true;
}

/* ------------------------------ PAY PAGE ------------------------------ */

function initPayPage() {
  if (!$("payBtn")) return false;

  setText("appName", APP_NAME);
  setText("year", String(new Date().getFullYear()));

  const params = parseParams();

// New: URL-based receipts (works on any device)
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

  if (!receipt) {
    } else {
    setStatus("good", "Ready to pay.");
  }

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

      const { fee, total } = calcFee(payAmount);

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
    initCreateLinkPage() ||
    initPayPage();

  // Landing page: just set footer year
  setText("year", String(new Date().getFullYear()));
  if (!ok && $("landingTitle")) {
    setText("landingTitle", `${APP_NAME} Pay`);
  }
})();