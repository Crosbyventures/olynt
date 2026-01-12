import { APP_NAME, TREASURY_WALLET, FEE_BPS, CHAINS, TOKENS, DEFAULT_CHAIN_ID, DEFAULT_TOKEN, RPC_BY_CHAIN, LS_KEYS } from "./config.js";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.2/+esm";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
];

function $(id){ return document.getElementById(id); }

function setStatus(kind, msg){
  const el = $("status");
  if(!el) return;
  el.className = "status " + (kind || "ok");
  el.textContent = msg;
}

function isAddress(a){
  try { return ethers.getAddress(a), true; } catch { return false; }
}

function qs(){
  const u = new URL(location.href);
  return u.searchParams;
}

function buildPayLink({ merchant, chainId, token, amount, memo, mode }){
  const u = new URL(location.origin + location.pathname.replace(/\/[^\/]*$/, "/pay.html"));
  u.searchParams.set("merchant", merchant);
  u.searchParams.set("chainId", String(chainId));
  u.searchParams.set("token", token);
  if (memo) u.searchParams.set("memo", memo);
  if (mode === "static"){
    u.searchParams.set("mode", "static");
  } else {
    u.searchParams.set("amount", String(amount)); // human readable, not wei
  }
  return u.toString();
}

function fillChainSelect(sel){
  sel.innerHTML = "";
  Object.keys(CHAINS).forEach((id)=>{
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = CHAINS[id].name + ` (${id})`;
    sel.appendChild(opt);
  });
}

function fillTokenSelect(sel){
  sel.innerHTML = "";
  Object.keys(TOKENS).forEach((k)=>{
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  });
}

function copyText(t){
  return navigator.clipboard.writeText(t);
}

/* =========================
   POS / CREATE LINK PAGES
========================= */

function initPOS(){
  if (!$("posMerchant")) return;

  const merchantEl = $("posMerchant");
  const chainEl = $("posChain");
  const tokenEl = $("posToken");
  const amountEl = $("posAmount");
  const memoEl = $("posMemo");

  fillChainSelect(chainEl);
  fillTokenSelect(tokenEl);

  // defaults
  chainEl.value = String(DEFAULT_CHAIN_ID);
  tokenEl.value = DEFAULT_TOKEN;

  const savedMerchant = localStorage.getItem(LS_KEYS.MERCHANT);
  if (savedMerchant) merchantEl.value = savedMerchant;

  let lastLink = "";

  function renderQR(link){
    lastLink = link;
    $("payLink").textContent = link;

    const box = $("qr");
    box.innerHTML = "";
    // QRCode lib
    new QRCode(box, { text: link, width: 220, height: 220 });
    setStatus("ok", "QR generated.");
  }

  $("btnStaticQR").onclick = () => {
    const merchant = merchantEl.value.trim();
    if (!isAddress(merchant)) return setStatus("err", "Invalid merchant address.");
    localStorage.setItem(LS_KEYS.MERCHANT, merchant);

    const chainId = Number(chainEl.value);
    const token = tokenEl.value;
    const memo = memoEl.value.trim();

    const link = buildPayLink({ merchant, chainId, token, memo, mode:"static" });
    renderQR(link);
  };

  $("btnDynamicQR").onclick = () => {
    const merchant = merchantEl.value.trim();
    if (!isAddress(merchant)) return setStatus("err", "Invalid merchant address.");
    localStorage.setItem(LS_KEYS.MERCHANT, merchant);

    const amt = amountEl.value.trim();
    if (!amt || Number(amt) <= 0) return setStatus("err", "Enter a valid amount.");
    const chainId = Number(chainEl.value);
    const token = tokenEl.value;
    const memo = memoEl.value.trim();

    const link = buildPayLink({ merchant, chainId, token, amount: amt, memo, mode:"dynamic" });
    renderQR(link);
  };

  $("btnCopy").onclick = async () => {
    if (!lastLink) return setStatus("warn", "Generate a QR first.");
    await copyText(lastLink);
    setStatus("ok", "Copied link.");
  };

  $("btnReset").onclick = () => {
    merchantEl.value = localStorage.getItem(LS_KEYS.MERCHANT) || "";
    amountEl.value = "";
    memoEl.value = "";
    $("payLink").textContent = "—";
    $("qr").innerHTML = "";
    setStatus("ok", "Reset.");
  };
}

function initCreateLink(){
  if (!$("lnMerchant")) return;

  const merchantEl = $("lnMerchant");
  const chainEl = $("lnChain");
  const tokenEl = $("lnToken");
  const amountEl = $("lnAmount");
  const memoEl = $("lnMemo");

  fillChainSelect(chainEl);
  fillTokenSelect(tokenEl);

  chainEl.value = String(DEFAULT_CHAIN_ID);
  tokenEl.value = DEFAULT_TOKEN;

  const savedMerchant = localStorage.getItem(LS_KEYS.MERCHANT);
  if (savedMerchant) merchantEl.value = savedMerchant;

  let lastLink = "";

  function render(link){
    lastLink = link;
    $("linkOut").textContent = link;
    const box = $("qr2");
    box.innerHTML = "";
    new QRCode(box, { text: link, width: 220, height: 220 });
    setStatus("ok", "Link generated.");
  }

  $("btnMakeLink").onclick = () => {
    const merchant = merchantEl.value.trim();
    if (!isAddress(merchant)) return setStatus("err", "Invalid merchant address.");
    localStorage.setItem(LS_KEYS.MERCHANT, merchant);

    const amt = amountEl.value.trim();
    if (!amt || Number(amt) <= 0) return setStatus("err", "Enter a valid amount.");

    const chainId = Number(chainEl.value);
    const token = tokenEl.value;
    const memo = memoEl.value.trim();

    const link = buildPayLink({ merchant, chainId, token, amount: amt, memo, mode:"dynamic" });
    render(link);
  };

  $("btnCopy2").onclick = async () => {
    if (!lastLink) return setStatus("warn", "Generate first.");
    await copyText(lastLink);
    setStatus("ok", "Copied link.");
  };

  $("btnClearLink").onclick = () => {
    $("linkOut").textContent = "—";
    $("qr2").innerHTML = "";
    amountEl.value = "";
    memoEl.value = "";
    setStatus("ok", "Cleared.");
  };
}

/* =========================
   PAY PAGE
========================= */

function walletDeepLinks(currentUrl){
  // iOS/Android wallet deep links (best-effort)
  const enc = encodeURIComponent(currentUrl);
  return {
    metamask: `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//,"")}`,
    coinbase: `https://go.cb-w.com/dapp?cb_url=${enc}`,
    trust: `https://link.trustwallet.com/open_url?coin_id=60&url=${enc}`,
  };
}

async function getTokenDecimals(chainId, tokenKey){
  const rpc = RPC_BY_CHAIN[chainId];
  if (!rpc) throw new Error("Unsupported chain RPC");
  const tokenAddr = TOKENS[tokenKey]?.addresses?.[chainId];
  if (!tokenAddr) throw new Error("Token not supported on this chain");

  const provider = new ethers.JsonRpcProvider(rpc);
  const c = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  const dec = await c.decimals(); // ✅ fixes BSC 18-decimals issue
  return Number(dec);
}

function formatMoney(x){
  if (x === "—") return "—";
  const n = Number(x);
  if (!isFinite(n)) return x;
  return n.toFixed(2);
}

function initPay(){
  if (!$("btnPay")) return;

  const p = qs();

  const merchant = (p.get("merchant") || "").trim();
  const chainId = Number(p.get("chainId") || "");
  const tokenKey = (p.get("token") || "").trim();
  const memo = p.get("memo") || "";
  const mode = p.get("mode") || "dynamic";
  const amountParam = p.get("amount"); // human amount for dynamic

  if (!isAddress(merchant) || !CHAINS[chainId] || !TOKENS[tokenKey]) {
    setStatus("warn", "Open a valid payment link (merchant + chainId + token).");
    return;
  }

  $("pMerchant").textContent = merchant;
  $("pNetwork").textContent = CHAINS[chainId].name;
  $("pToken").textContent = tokenKey;
  $("pMemo").textContent = memo ? memo : "—";

  let amountHuman = amountParam ? String(amountParam) : "";
  if (mode === "static") {
    $("staticAmountBox").style.display = "block";
    $("pAmount").textContent = "Enter amount below";
    $("pFee").textContent = "—";
    $("pTotal").textContent = "—";
  } else {
    $("pAmount").textContent = "$" + formatMoney(amountHuman);
    const fee = (Number(amountHuman) * (FEE_BPS/10000));
    const total = Number(amountHuman) + fee;
    $("pFee").textContent = "$" + formatMoney(fee);
    $("pTotal").textContent = "$" + formatMoney(total);
  }

  // deep link buttons (Safari scan case)
  const links = walletDeepLinks(location.href);
  $("openMM").href = links.metamask;
  $("openCB").href = links.coinbase;
  $("openTW").href = links.trust;

  let provider, signer, walletAddress = "";
  let connectedChainId = 0;

  function showInjectedMissing(){
    $("openWalletBox").style.display = "block";
    setStatus("warn", "No wallet injected. Open inside MetaMask/Trust/Coinbase browser.");
  }

  async function connectInjected(){
    if (!window.ethereum) return showInjectedMissing();

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    walletAddress = await signer.getAddress();
    connectedChainId = Number((await provider.getNetwork()).chainId);

    $("walletAddr").textContent = walletAddress;
    $("walletNet").textContent = String(connectedChainId);

    setStatus("ok", "Wallet connected.");
  }

  $("btnConnect").onclick = async () => {
    try { await connectInjected(); }
    catch (e) { setStatus("err", e?.message || "Connect failed."); }
  };

  $("btnPay").onclick = async () => {
    try {
      // need injected wallet
      if (!window.ethereum) return showInjectedMissing();
      if (!signer) await connectInjected();

      // if static QR, take amount from input
      if (mode === "static") {
        const a = $("pAmountInput").value.trim();
        if (!a || Number(a) <= 0) return setStatus("err", "Enter a valid amount.");
        amountHuman = a;

        $("pAmount").textContent = "$" + formatMoney(amountHuman);
        const fee = (Number(amountHuman) * (FEE_BPS/10000));
        const total = Number(amountHuman) + fee;
        $("pFee").textContent = "$" + formatMoney(fee);
        $("pTotal").textContent = "$" + formatMoney(total);
      }

      // enforce chain
      if (connectedChainId !== chainId) {
        // request switch
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + chainId.toString(16) }]
        });
        connectedChainId = chainId;
        $("walletNet").textContent = String(connectedChainId);
      }

      // token info
      const tokenAddr = TOKENS[tokenKey].addresses[chainId];
      if (!tokenAddr) return setStatus("err", "Token not supported on this chain.");

      // ✅ decimals fix
      const decimals = await getTokenDecimals(chainId, tokenKey);

      // fee & split
      const feeHuman = (Number(amountHuman) * (FEE_BPS/10000));
      const totalHuman = Number(amountHuman) + feeHuman;

      const totalUnits = ethers.parseUnits(String(totalHuman), decimals);
      const feeUnits = ethers.parseUnits(String(feeHuman), decimals);
      const merchantUnits = totalUnits - feeUnits;

      // send 2 transfers: merchant + treasury
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

      setStatus("ok", "Sending… confirm in wallet.");

      const tx1 = await token.transfer(merchant, merchantUnits);
      await tx1.wait();

      let txHashFinal = tx1.hash;

      if (feeUnits > 0n) {
        const tx2 = await token.transfer(TREASURY_WALLET, feeUnits);
        await tx2.wait();
        txHashFinal = tx2.hash;
      }

      // show receipt
      $("receiptBox").style.display = "block";
      $("txHash").textContent = txHashFinal;
      $("txLink").href = CHAINS[chainId].explorerTx(txHashFinal);

      // save receipt locally
      const rec = JSON.parse(localStorage.getItem(LS_KEYS.RECEIPTS) || "[]");
      rec.unshift({
        at: Date.now(),
        chainId, token: tokenKey,
        merchant, payer: walletAddress,
        amount: String(amountHuman),
        fee: String(feeHuman),
        tx: txHashFinal
      });
      localStorage.setItem(LS_KEYS.RECEIPTS, JSON.stringify(rec.slice(0,50)));

      setStatus("ok", "Paid successfully ✅");
    } catch (e) {
      setStatus("err", e?.shortMessage || e?.message || "Payment failed.");
    }
  };

  // auto detect injected
  if (!window.ethereum) {
    $("walletAddr").textContent = "—";
    $("walletNet").textContent = "—";
    $("openWalletBox").style.display = "block";
  }
}

/* =========================
   BOOT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  try {
    initPOS();
    initCreateLink();
    initPay();
  } catch (e) {
    setStatus("err", e?.message || "App error.");
  }
});
