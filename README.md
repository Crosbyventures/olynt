# Olynt Pay — Frontend-Only (USDC, All Networks)

**Olynt Pay** is a frontend-only Web3 checkout that supports **ALL major networks with native USDC**:
- Ethereum
- Base
- Optimism
- Arbitrum
- Polygon

## Fee Model
- **2% fee added on top**
- Customer pays fee
- Merchant receives 100%
- Fee goes to Olynt treasury

## Treasury Wallet
0x1a605eea1105f99df7badb733c82a8c24c2eb172

## How payments work
1) Pay merchant (USDC)
2) Pay Olynt fee (USDC)

## Go Live Today
- No backend
- No contracts
- Deploy as static site

## Shareable Link
/#/pay?merchant=0xMERCHANT&amount=100&memo=Invoice123

## Auto Network Switch
If user is on unsupported network, app prompts switch to Base automatically.

## Next Versions (optional)
- One-tx splitter contract
- USDT support
- Merchant dashboard


## Auto-open wallet modal
The wallet selector modal auto-opens on `pay.html` if the user is not connected yet.
