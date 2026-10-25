# gaeludyr-cli

Command-line client and MCP server for [Gæludýr.is](https://www.gaeludyr.is), an Icelandic pet-supply shop: search the catalogue, check stock, manage a cart, see your orders and shipping options.

> Unofficial — not affiliated with Gæludýr.is. It uses the shop's undocumented web APIs, which can change without notice.

## Install

Requires [Bun](https://bun.sh) ≥ 1.1.

```sh
bun add -g github:axelpaul/gaeludyr-cli        # install
bun add -g github:axelpaul/gaeludyr-cli        # update (re-run; pulls the latest default branch)
bun remove -g gaeludyr-cli                     # uninstall
```

This puts `gaeludyr` in `~/.bun/bin`. Check with `gaeludyr --version`.

No Bun? Download a prebuilt binary (`gaeludyr-<os>-<arch>`, with `SHA256SUMS`) from the [Releases page](https://github.com/axelpaul/gaeludyr-cli/releases), make it executable and put it on your `PATH`.

## Authentication

Catalogue search (`search`) needs no login. Your profile, orders and order detail need a gaeludyr.is session. Product, postcode, Dropp, cart totals, shipping and payment-method lookups send the session if you have one; they may also work without it.

Log in with Auðkenni (Icelandic eID). The shop's own backend proxies the request to Auðkenni:

```sh
gaeludyr login --phone <7-digit mobile>          # SIM-based Auðkenni (default)
gaeludyr login --phone <mobile> --type App --ssn <kennitala>   # Auðkennisappið
gaeludyr me                                      # verify
gaeludyr logout
```

Confirm the request on your phone. The resulting iron-sealed `kk_fe` cookie is saved to `session.json` in the config directory (mode 0600) and replayed on authenticated requests. For headless use you can instead set `GAELUDYR_KK_FE` to the cookie value.

## CLI usage

```sh
gaeludyr search "happy cat" --in-stock           # Typesense catalogue search
gaeludyr search --category kettir --brand happy-cat --per-page 50
gaeludyr product <slug>                          # stock, price, sale price, max qty

gaeludyr cart                                    # show cart with server-computed totals
gaeludyr cart add 46685 --qty 2                  # by product ID
gaeludyr cart add "happy cat lachs 10kg"         # or fuzzy name (see --min-score)
gaeludyr cart remove 46685
gaeludyr cart set --items '[{"id":46685,"qty":2},{"id":12345,"qty":1}]'
echo '[{"id":46685,"qty":2}]' | gaeludyr cart set
gaeludyr cart coupon SUMAR10                     # empty code removes it
gaeludyr cart clear

gaeludyr orders --page 1
gaeludyr order 12345

gaeludyr checkout shipping --postcode 101 --street "Dæmigata 1" --city Reykjavík
gaeludyr checkout payment
gaeludyr postcode 104
gaeludyr dropp --near kringlan
```

| Command | Description |
|---|---|
| `login --phone <NNNNNNN> [--ssn <kt>] [--type Sim\|App\|Card]` | Auðkenni login; caches the session cookie |
| `logout` | Clear the cached session |
| `me` | Your profile (addresses, kennitala, preferred shipping) |
| `search [<query>] [--category <slug>] [--brand <slug>] [--in-stock] [--page N] [--per-page N]` | Catalogue search |
| `product <slug>` | Stock and pricing for a product |
| `cart [show]` | Cart with server-enriched line items and totals |
| `cart add <id\|slug\|name> [--qty N] [--min-score N]` | Add item. Numeric means product ID; otherwise fuzzy-matched. `--min-score` (default 5) rejects weak matches |
| `cart remove <id\|slug\|name> [--min-score N]` | Remove item |
| `cart set --items <json> [--coupon <code>]` | Replace the whole cart (JSON inline or on stdin) |
| `cart clear` | Empty the cart |
| `cart coupon <code>` | Apply (or with an empty code, remove) a coupon |
| `orders [--page N]` | List your orders |
| `order <id>` | Order detail |
| `checkout shipping --postcode <NNN> --street <addr> --city <name> [--country IS] [--ssn <kt>]` | Shipping methods and costs for the current cart |
| `checkout payment` | List payment methods |
| `postcode <NNN>` | Postcode lookup |
| `dropp [--near <text>]` | Dropp parcel pickup locations |
| `serve` | Start the MCP server on stdio (`mcp` is an alias) |

Global flags: `--json` forces JSON output, `--pretty` forces human-readable, `--help`, `--version`.

The CLI cannot place orders or pay; `checkout` only computes shipping options and lists payment methods.

### Agent / scripting use

Output is JSON whenever stdout isn't a TTY. Errors are JSON on stderr with exit code 1.

`gaeludyr help --json` returns a typed catalogue of every command, argument and flag (`type`, `required`, `enum`, `default`), enough to register the CLI as a function-calling tool.

```sh
gaeludyr help --json | jq '.commands[] | {name, args: [.args[] | {name, type, required}]}'
gaeludyr search "fish" --json | jq '.products[0]'
gaeludyr orders --json | jq '.orders | map(.id)'
```

**Fuzzy-match confidence.** When `cart add` resolves a name through search, the JSON response includes the chosen match, its score and runner-up alternatives:

```sh
gaeludyr cart add "happy cat lachs 10kg" --json | jq '.match'
# { "resolution": "fuzzy", "query": "...", "matched": { "id": "...", "score": 65 }, "alternatives": [...] }
```

Raise `--min-score` to be stricter; anything below it is rejected with the top candidates listed so you can retry by exact ID.

**Batch cart.** `cart set` replaces the cart in one round-trip. Items may be `{id, qty}` or `{productId, quantity}`.

## MCP server

`gaeludyr serve` runs a Model Context Protocol server on stdio. It uses the same library code as the CLI and shares its session and cart files, so you can log in and fill a cart from the terminal and read it from your assistant (or the other way round).

| Tool | Access | Description |
|---|---|---|
| `search` | read | Search the public catalogue by query, category and/or brand |
| `product` | read | Stock and price for a product slug |
| `postcode` | read | Postcode lookup |
| `dropp_locations` | read | Dropp pickup locations, optional name/address filter |
| `me` | read (login) | Your profile: name, addresses, kennitala, preferred shipping |
| `orders` | read (login) | List your orders |
| `order` | read (login) | Detail for one order |
| `cart_view` | read | Current cart with server-computed totals |
| `checkout_shipping` | read | Shipping methods and costs for the cart to a destination |
| `payment_methods` | read | Payment methods offered at checkout |
| `cart_add` | write | Add a product by ID, slug or name |
| `cart_remove` | write | Remove a product |
| `cart_set` | write | Replace the whole cart |
| `cart_clear` | write | Empty the cart |
| `cart_coupon` | write | Apply or remove a coupon |

**Writes are off by default.** The `cart_*` mutation tools are only registered when the server is started with `GAELUDYR_MCP_ENABLE_WRITES=1`, and each call must also pass `"confirm": true`. Cart changes only touch your local cart file; gaeludyr.is just computes totals. Nothing is ordered or charged.

Not exposed over MCP:
- `login` / `logout`: login needs a phone number and a confirmation on your phone. Run `gaeludyr login` in a terminal; the MCP server picks up the saved session.
- Placing orders and paying: the CLI doesn't do this either. If it is ever added, it should stay CLI-only, because an order and card payment cannot be undone from here.

### Claude Code

```sh
claude mcp add gaeludyr -- gaeludyr serve
# with cart writes:
claude mcp add gaeludyr -e GAELUDYR_MCP_ENABLE_WRITES=1 -- gaeludyr serve
```

### Claude Desktop, Cursor and other JSON-configured clients

```json
{
  "mcpServers": {
    "gaeludyr": {
      "command": "gaeludyr",
      "args": ["serve"],
      "env": { "GAELUDYR_MCP_ENABLE_WRITES": "1" }
    }
  }
}
```

Leave out `env` for read-only. GUI apps often don't have `~/.bun/bin` on their `PATH`; if the server fails to start, use the absolute path from `which gaeludyr` as `command`.

## Configuration

| Variable | Description |
|---|---|
| `GAELUDYR_MCP_ENABLE_WRITES` | `1` registers the cart mutation tools in the MCP server |
| `GAELUDYR_KK_FE` | Session cookie value to use instead of the saved login |
| `GAELUDYR_CONFIG_DIR` | Override the config directory |
| `XDG_CONFIG_HOME` / `XDG_CACHE_HOME` | Standard base directories |

Files:
- `$XDG_CONFIG_HOME/gaeludyr-cli/` (default `~/.config/gaeludyr-cli/`): `session.json` (login cookie, mode 0600) and `cart.json` (the local cart).
- `$XDG_CACHE_HOME/gaeludyr-cli/buildid.json` (default `~/.cache/...`): cached Next.js build ID.
- Versions before 0.2 used `~/.gaeludyr/`; it is still read as a fallback, so existing logins keep working.

### How the site works

- **Auth:** the front end calls `/api/auth/start` and `/api/auth/poll` on gaeludyr.is, which proxy to Auðkenni. Success sets the `kk_fe` cookie.
- **Search:** Typesense Cloud `/multi_search`, using the public search-only key embedded in the site's JavaScript.
- **Cart:** stateless on the server. `POST /api/cart` takes the desired cart and returns line items and totals. The canonical cart is the local `cart.json`, re-POSTed on every change.
- **Order detail:** comes from the Next.js SSR data route `/_next/data/{buildId}/is/minar-sidur/pantanir/{id}.json`. The build ID is scraped from `__NEXT_DATA__` on the homepage, cached for an hour and refreshed when a deploy rotates it.

## Development

```sh
git clone https://github.com/axelpaul/gaeludyr-cli
cd gaeludyr-cli
bun install
bun run check          # biome lint + tsc + bun test
bun src/index.ts --help
bun run build          # standalone ./gaeludyr binary
```

```
src/
├── index.ts             # arg parsing, routing, help schema
├── commands/            # CLI presentation, one module per command
├── mcp/server.ts        # MCP tools (same lib code as the CLI)
└── lib/
    ├── cart.ts          # cart operations shared by CLI and MCP
    ├── checkout.ts      # shipping options
    ├── orders.ts        # order list/detail
    ├── client.ts        # gaeludyr.is /api/* client
    ├── auth-client.ts   # Auðkenni start + poll
    ├── typesense.ts     # catalogue search
    ├── nextjs.ts        # build-ID discovery + SSR data fetch
    ├── fuzzy.ts         # product name matching for `cart add`
    ├── config.ts        # paths, session, cart, cache
    ├── output.ts        # TTY-aware output
    └── types.ts         # API shapes
```

Releases: pushing a `v*` tag runs the checks, builds binaries for Linux, macOS and Windows, and attaches them to a GitHub release.

The API surface was reverse-engineered with [cli-maker](https://github.com/axelpaul/cli-maker), a Playwright-based traffic sniffer.

## License

MIT
