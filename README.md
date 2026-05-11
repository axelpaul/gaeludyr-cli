# gaeludyr-cli

Command-line client for [gaeludyr.is](https://www.gaeludyr.is), an Icelandic pet supply store. Built with Bun + TypeScript. Works for humans (pretty terminal output) and for agents (JSON when piped, plus a machine-readable command schema via `gaeludyr help --json`).

## Install

```bash
git clone https://github.com/axelpaul/gaeludyr-cli
cd gaeludyr-cli
bun install
bun link              # makes `gaeludyr` globally available
```

Requires [Bun](https://bun.sh).

To build a standalone binary:

```bash
bun run build         # produces ./gaeludyr
```

## Quick start

```bash
# 1. Log in via Audkenni Sim (BFF-proxied through gaeludyr.is)
gaeludyr login --phone <7-digit-mobile>
#   → confirm the request on your phone, then your session cookie is cached

# 2. Verify
gaeludyr me

# 3. Search the catalog (Typesense — no auth required)
gaeludyr search "happy cat" --in-stock

# 4. Add items to the cart (by product ID, slug, or fuzzy name)
gaeludyr cart add 46685 --qty 2
gaeludyr cart add "happy cat lachs 10kg"

# 5. Review cart with totals
gaeludyr cart

# 6. List past orders
gaeludyr orders
gaeludyr order 62331

# 7. Check what shipping options apply
gaeludyr checkout shipping --postcode 104 --street "<street address>" --city Reykjavík
gaeludyr checkout payment
```

## Commands

| Command | Description |
|---|---|
| `login --phone <NNNNNNN> [--ssn <kt>] [--type Sim\|App\|Card]` | Audkenni auth flow. Caches `kk_fe` cookie under `~/.gaeludyr/session.json` |
| `logout` | Clear cached session |
| `me` | Show authenticated user profile (addresses, kennitala, preferred shipping) |
| `search <query> [--category <slug>] [--brand <slug>] [--in-stock] [--page N] [--per-page N]` | Typesense catalog search |
| `product <slug>` | Stock + pricing for a product |
| `cart` | Show current cart with server-enriched line items + totals |
| `cart add <id\|slug\|name> [--qty N] [--min-score N]` | Add item. Numeric → product ID; otherwise fuzzy-matched via Typesense. `--min-score` rejects low-confidence matches (default 5) |
| `cart remove <id\|slug\|name> [--min-score N]` | Remove item |
| `cart set --items <json>` | Batch replace the entire cart. Pass JSON inline or pipe via stdin. See below. |
| `cart clear` | Empty the cart |
| `cart coupon <code>` | Apply (or pass empty to remove) a coupon |
| `orders [--page N]` | List your orders |
| `order <id>` | Order detail (via Next.js SSR data route — auto-discovers build ID) |
| `checkout shipping --postcode <NNN> --street <addr> --city <name> [--country IS] [--ssn <kt>]` | Compute available shipping methods for your current cart + destination |
| `checkout payment` | List available payment methods |
| `postcode <NNN>` | Look up city/street info |
| `dropp [--near <substring>]` | List Dropp parcel pickup locations |

Global flags: `--json` forces JSON output, `--pretty` forces human-readable, `--help` shows usage.

## Auth

gaeludyr.is uses **Audkenni** (Icelandic eID) via a BFF — the front-end talks to `/api/auth/start` and `/api/auth/poll` on gaeludyr's own domain, which proxies to Audkenni server-side. The result is an iron-sealed session cookie (`kk_fe=Fe26.2*…`) that the CLI stores in `~/.gaeludyr/session.json` and replays on every authenticated request.

Default auth type is `Sim` (SIM-based Audkenni — confirm on your phone). For `App` (Auðkennisappið) or `Card` (smart card), supply `--ssn <kennitala>` as well.

## Agent / scripting use

JSON is the primary interface. Output is JSON whenever stdout isn't a TTY. Errors are JSON in JSON mode too, written to stderr with exit code 1. Each command supports `--json` and `--pretty` to force a mode explicitly.

**Typed command schema** — `gaeludyr help --json` returns a structured catalog of every command, argument, and flag. Each arg has a `type` (`string`/`integer`/`boolean`), `required` flag, optional `enum` (e.g. `--type` is `["Sim", "App", "Card"]`), and `default` value. Sufficient for auto-registering this CLI as a function-calling tool.

```bash
gaeludyr help --json | jq '.commands[] | {name, args: [.args[] | {name, type, required}]}'
gaeludyr search "fish" --json | jq '.products[0]'
gaeludyr orders --json | jq '.orders | map(.id)'
```

**Fuzzy-match confidence** — When `cart add` resolves a free-text name through Typesense, the JSON response includes the chosen match with its score and the runner-up alternatives, so an agent can detect low-confidence selections:

```bash
gaeludyr cart add "happy cat lachs 10kg" --json | jq '.match'
# {
#   "resolution": "fuzzy",
#   "query": "happy cat lachs 10kg",
#   "matched": { "id": "...", "name": "...", "slug": "...", "score": 65 },
#   "alternatives": [ { "id": "...", "score": 32 }, ... ]
# }
```

Tighten the threshold with `--min-score N` — anything below it is rejected with an error listing the top candidates, so the agent can pick one by exact ID instead.

**Batch cart mutations** — `cart set` replaces the entire cart in a single round-trip. Useful for agents assembling an order from N items without N round-trips:

```bash
gaeludyr cart set --items '[{"id":46685,"qty":2},{"id":12345,"qty":1}]' --json
# or pipe:
echo '[{"id":46685,"qty":2}]' | gaeludyr cart set --json
```

Accepted shapes per item: `{id, qty}` or `{productId, quantity}`. The CLI also writes the same state to `~/.gaeludyr/cart.json` so a subsequent `gaeludyr cart` is consistent.

## Files

```
src/
├── index.ts             # arg parsing + command routing + help schema
├── commands/            # one module per command
└── lib/
    ├── types.ts         # API request/response shapes
    ├── config.ts        # ~/.gaeludyr/ — session, cart, buildId cache
    ├── output.ts        # TTY-aware JSON/pretty output
    ├── auth-client.ts   # Audkenni start + poll loop, cookie aggregation
    ├── client.ts        # Authenticated /api/* client (kk_fe cookie)
    ├── typesense.ts     # Typesense Cloud /multi_search client
    ├── nextjs.ts        # __NEXT_DATA__ build-ID discovery + SSR data fetch
    └── fuzzy.ts         # Token-overlap product matching for `cart add`
```

The cart is **stateless on the server**: `/api/cart` is a pure compute endpoint that takes a desired cart state and returns enriched line items + totals. The CLI keeps the canonical state at `~/.gaeludyr/cart.json` and POSTs it on every mutation.

Order detail comes from the Next.js SSR data route (`/_next/data/{buildId}/is/minar-sidur/pantanir/{id}.json`) since gaeludyr has no separate `/api/orders/{id}` endpoint. The CLI discovers the current `buildId` by parsing `<script id="__NEXT_DATA__">` from the homepage and caches it for an hour, refreshing automatically when the buildId rotates after a deploy.

## How this was built

The API surface, request/response shapes, and auth flow were reverse-engineered with [cli-maker](https://github.com/axelpaul/cli-maker) — a Playwright-based tool that sniffs network traffic, deduplicates endpoints, and detects auth mechanisms. The resulting `gaeludyr_spec.json` was then fed to the `cli-creator` skill to scaffold this CLI.
