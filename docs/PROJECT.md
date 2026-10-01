# Product Talk — living map

Scan a grocery barcode → talk to that product over LiveKit + OpenAI GPT-Live-1.

## Layout

```
agent/src/agent.py       GPTLiveModel worker, RPC set_product
agent/src/catalog.py     FolderCatalog (swap this for RAG)
agent/src/product.py     Product + compact_card (≤1800 chars)
kiosk/                   Next.js + Agents UI
kiosk/app/api/token      LiveKit JWT + agent dispatch
kiosk/app/api/health     LIVEKIT_* present?
kiosk/app/api/catalog    list products
kiosk/app/api/product/[ean]
data/products/{ean}/     meta.txt nutrition.txt ingredients.txt allergens.txt notes.txt
ecosystem.config.cjs     PM2 process definitions
https-proxy.mjs          :8443 → :8030 TLS
```

## Runtime

```
[kiosk Chrome]
  USB HID / camera / tap sample
       │
       ▼
  Next :8030  (HTTPS :8443 proxy)
  POST /api/token  → LiveKit Cloud
       │  RPC set_product(barcode)
       ▼
  Python worker  GPT-Live-1 + luna backend
       ▼
  FolderCatalog.get(ean) → append_thinking + tools
```

Voice instructions = how to talk / when to delegate. Backend instructions = tools + pack facts only.

## Deploy

PM2 processes (see `ecosystem.config.cjs`): `product-kiosk` · `product-kiosk-https` · `product-kiosk-agent`.

Build on the host: `cd agent && uv sync`, then `cd kiosk && pnpm install && pnpm build`, then `pm2 restart` the three processes. Keep `.env.local` out of version control.

## Catalog v2 (not built)

Keep `FolderCatalog.get` / `.search` signatures. Implement a vector store behind the same methods. Do not change tools (`get_scanned_product`, `lookup_barcode`, `search_product_text`).

## Docs used

- https://docs.livekit.io/agents/models/realtime/plugins/gpt-live/
- https://docs.livekit.io/frontends/agents-ui/
- https://developers.openai.com/api/docs/models/gpt-live-1
