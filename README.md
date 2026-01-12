# Olynt (Frontend-only)

Pages:
- index.html = POS QR generator (merchant can generate static/dynamic QR without connecting)
- create-link.html = create shareable payment link + QR
- pay.html = customer checkout

Notes:
- Receipts stored in localStorage only.
- Works best when pay.html is opened inside a wallet browser (MetaMask/Trust/Coinbase).
- Safari scanning is supported via "Open in Wallet" buttons.

Main Fix:
- Token decimals are fetched from chain (decimals()) so BSC USDT/USDC amounts are correct. 
