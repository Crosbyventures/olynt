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

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
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

function parseParams() {
  const u = new URL(window.location.href);
  const out = {};
  u.searchParams.forEach((v, k) => (out[k] = v));
  const h = u.hash || "";
  const qIndex = h.indexOf("?");
  if (qIndex >= 0) {
    const qs = h.slice(qIndex + 1);
    const hp = new URLSearchParams(qs);
    hp.forEach((v, k) => (out[k] = v));
  }
  return out;
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

function ensureChainAndToken(chainId, tokenKey) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error("Unsupported network.");
  const token = TOKENS[tokenKey];
  if (!token) throw new Error("Unsupported token.");
  const addr = token.addresses[chainId];
  if (!addr) throw new Error(`${tokenKey} not available on ${chain.name}.`);
  return { chain, tokenAddress: addr };
}

/* -------------------- PROFESSIONAL "OPEN IN WALLET" FLOW -------------------- */

function toDappPath(url) {
  return url.replace(/^https?:\/\//, "");
}

function setupOpenInWalletButtons(currentUrl) {
  const box = $("openInWalletBox");
  if (!box) return;

  // show box
  box.style.display = "block";

  const mm = $("openMetaMask");
  const cb = $("openCoinbase");
  const tw = $("openTrust");

  // deep links (works after QR scan in Safari/Chrome)
  if (mm) mm.href = `https://metamask.app.link/dapp/${toDappPath(currentUrl)}`;
  if (cb) cb.href = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}`;
  if (tw) tw.href = `https://link.trustwallet.com/open_url?url=${encodeURIComponent(currentUrl)}`;

  $("copyLinkBtn2")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(currentUrl);
    setStatus("good", "Copied ✅ Paste it in MetaMask Browser.");
  });
}

/* ------------------------------ PAY PAGE ------------------------------ */

function initPayPage() {
  if (!$("payBtn")) return false;

  setText("year", String(new Date().getFullYear()));
  setText("treasuryPreview", TREASURY_WALLET);

  const params = parseParams();
  const form = {
    rid: params.rid || "",
    chainId: Number(params.chainId || DEFAULT_CHAIN_ID),
    token: (params.token || DEFAULT_TOKEN),
    amount: (params.amount || ""),
    merchant: (params.merchant || ""),
    memo: (params.memo || ""),
    expiresAt: (params.expiresAt || ""),
  };

  // populate preview
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

  // If opened from QR scan in normal browser => show Open-in-wallet buttons
  const currentUrl = window.location.href;

  if (!window.ethereum) {
    $("payUi").style.display = "none";
    setupOpenInWalletButtons(currentUrl);
    setStatus("warn", "Open this payment in a wallet to connect and pay.");
    return true;
  }

  // inside wallet browser => show pay UI
  $("openInWalletBox").style.display = "none";
  $("payUi").style.display = "block";

  if (!form.merchant || !form.amount) {
    setStatus("bad", "Invalid payment link (missing merchant/amount).");
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

      const payAmount = Number(form.amount);
      if (!Number.isFinite(payAmount) || payAmount <= 0) throw new Error("Invalid amount.");
      if (!form.merchant || !form.merchant.startsWith("0x")) throw new Error("Invalid merchant address.");

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

      const { signer: signer2 } = await connectWallet();
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer2);
      const decimals = 6; // USDC/USDT are 6 decimals on all your listed chains

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

      $("txMerchant").href = chain.explorerTx(r1.hash);
      $("txFee").href = chain.explorerTx(r2.hash);
      $("txBox").classList.remove("hidden");

      setStatusptxt("wallet", clampAddress(account));
      setStatus("good", "Paid ✅");
    } catch (e) {
      setStatus("bad", e.message || "Payment failed.");
    }
  });

  return true;
}

/* ------------------------------ BOOT ------------------------------ */

(function boot() {
  setText("year", String(new Date().getFullYear()));
  initPayPage();
})();
