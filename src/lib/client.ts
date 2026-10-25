import { BASE_URL, cookieHeader, loadSession, requireSession, USER_AGENT } from "./config.ts";
import type {
	CartRequest,
	CartResponse,
	CheckoutShippingRequest,
	CheckoutShippingResponse,
	DroppLocationsResponse,
	OrderSummary,
	PaymentMethod,
	PostcodeLookup,
	ProductCartData,
	UserProfile,
} from "./types.ts";

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * Client for gaeludyr.is `/api/*`. The session cookie is sent whenever one is
 * available; endpoints marked `auth` fail fast without one. Endpoints such as
 * postcode lookup and Dropp locations may also work anonymously.
 */
export class GaeludyrClient {
	private headers(auth: boolean, extra: Record<string, string> = {}): Record<string, string> {
		const session = auth ? requireSession() : loadSession();
		return {
			accept: "application/json",
			"user-agent": USER_AGENT,
			...(session ? { cookie: cookieHeader(session) } : {}),
			referer: `${BASE_URL}/`,
			...extra,
		};
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		query?: Record<string, string | number>,
		auth = false,
	): Promise<T> {
		const qs = query
			? `?${Object.entries(query)
					.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
					.join("&")}`
			: "";
		const res = await fetch(`${BASE_URL}${path}${qs}`, {
			method,
			headers: this.headers(
				auth,
				body ? { "content-type": "application/json", origin: BASE_URL } : {},
			),
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			if ((res.status === 401 || res.status === 403) && auth) {
				throw new ApiError(
					`${method} ${path}: ${res.status} — session missing or expired. Run "gaeludyr login".`,
					res.status,
				);
			}
			throw new ApiError(`${method} ${path}: ${res.status} ${text.slice(0, 500)}`, res.status);
		}
		if (res.status === 204) return undefined as T;
		const ct = res.headers.get("content-type") ?? "";
		if (ct.includes("application/json")) {
			return (await res.json()) as T;
		}
		return (await res.text()) as unknown as T;
	}

	// ─── User ───────────────────────────────────────────────────

	getProfile(): Promise<UserProfile> {
		return this.request<UserProfile>("GET", "/api/users/me", undefined, undefined, true);
	}

	updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
		return this.request<UserProfile>("PUT", "/api/users/me", profile, undefined, true);
	}

	getMeta(key: string): Promise<unknown> {
		return this.request<unknown>("GET", "/api/users/me/meta", undefined, { meta_key: key }, true);
	}

	setMeta(key: string, value: unknown): Promise<unknown> {
		return this.request<unknown>(
			"PUT",
			"/api/users/me/meta",
			{ meta_key: key, meta_value: value },
			undefined,
			true,
		);
	}

	setPreferredShipping(method: unknown): Promise<{ message: string }> {
		return this.request<{ message: string }>(
			"PUT",
			"/api/users/me/preferred-shipping",
			{ preferredShippingMethod: method },
			undefined,
			true,
		);
	}

	// ─── Cart ───────────────────────────────────────────────────

	postCart(cart: CartRequest): Promise<CartResponse> {
		return this.request<CartResponse>("POST", "/api/cart", cart);
	}

	// ─── Orders ─────────────────────────────────────────────────

	listOrders(page = 1): Promise<OrderSummary[]> {
		return this.request<OrderSummary[]>("GET", "/api/orders", undefined, { page }, true);
	}

	// ─── Products ───────────────────────────────────────────────

	getProductCartData(slug: string): Promise<ProductCartData> {
		return this.request<ProductCartData>(
			"GET",
			`/api/products/cart-data/${encodeURIComponent(slug)}`,
		);
	}

	// ─── Checkout ───────────────────────────────────────────────

	checkoutShipping(req: CheckoutShippingRequest): Promise<CheckoutShippingResponse> {
		return this.request<CheckoutShippingResponse>("POST", "/api/checkout/shipping", req);
	}

	checkoutPayment(): Promise<PaymentMethod[]> {
		return this.request<PaymentMethod[]>("GET", "/api/checkout/payment");
	}

	// ─── Postcode lookup ────────────────────────────────────────

	postcodeLookup(postcode: string): Promise<PostcodeLookup> {
		return this.request<PostcodeLookup>("GET", "/api/postcode-lookup", undefined, { postcode });
	}

	// ─── Dropp pickup locations ─────────────────────────────────

	droppLocations(): Promise<DroppLocationsResponse> {
		return this.request<DroppLocationsResponse>("GET", "/dropp/api/v1/dropp/locations");
	}
}
