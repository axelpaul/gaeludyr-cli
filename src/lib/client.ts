import { BASE_URL, USER_AGENT, cookieHeader, requireSession } from "./config.ts";
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

export class GaeludyrClient {
	private cookie: string;

	constructor() {
		this.cookie = cookieHeader(requireSession());
	}

	private headers(extra: Record<string, string> = {}): Record<string, string> {
		return {
			accept: "application/json",
			"user-agent": USER_AGENT,
			cookie: this.cookie,
			referer: `${BASE_URL}/`,
			...extra,
		};
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		query?: Record<string, string | number>,
	): Promise<T> {
		const qs = query
			? `?${Object.entries(query)
					.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
					.join("&")}`
			: "";
		const res = await fetch(`${BASE_URL}${path}${qs}`, {
			method,
			headers: this.headers(body ? { "content-type": "application/json", origin: BASE_URL } : {}),
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
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
		return this.request<UserProfile>("GET", "/api/users/me");
	}

	updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
		return this.request<UserProfile>("PUT", "/api/users/me", profile);
	}

	getMeta(key: string): Promise<unknown> {
		return this.request<unknown>("GET", "/api/users/me/meta", undefined, { meta_key: key });
	}

	setMeta(key: string, value: unknown): Promise<unknown> {
		return this.request<unknown>("PUT", "/api/users/me/meta", { meta_key: key, meta_value: value });
	}

	setPreferredShipping(method: unknown): Promise<{ message: string }> {
		return this.request<{ message: string }>("PUT", "/api/users/me/preferred-shipping", {
			preferredShippingMethod: method,
		});
	}

	// ─── Cart ───────────────────────────────────────────────────

	postCart(cart: CartRequest): Promise<CartResponse> {
		return this.request<CartResponse>("POST", "/api/cart", cart);
	}

	// ─── Orders ─────────────────────────────────────────────────

	listOrders(page = 1): Promise<OrderSummary[]> {
		return this.request<OrderSummary[]>("GET", "/api/orders", undefined, { page });
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
