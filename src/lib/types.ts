// ─── Auth ───────────────────────────────────────────────────────

export type AuthType = "Sim" | "App" | "Card";

export interface AuthStartRequest {
	phoneNumber: string;
	ssn: string;
	authType: AuthType;
}

export interface AuthStartResponse {
	authRequestId: string;
}

export interface AuthPollResponse {
	statusMessage: string;
	done: boolean;
}

export interface SessionCookies {
	kk_fe: string;
	// Iron cookies may be split when > ~4KB
	kk_fe_2?: string;
	// Any additional cookies the auth flow set
	extra?: Record<string, string>;
}

// ─── User ───────────────────────────────────────────────────────

export interface Address {
	first_name: string;
	last_name: string;
	company: string;
	address_1: string;
	address_2: string;
	city: string;
	postcode: string;
	country: string;
	state?: string;
	email?: string;
	phone: string;
	phone_cc: string;
	ssn: string;
	Receiver: string;
}

export interface PreferredShipmentMethod {
	id: string;
	method_id: string;
	instance_id: number;
	label: string;
	cost: string;
	order: number;
	description?: string;
	logo?: string | null;
	meta_data?: Record<string, unknown>;
}

export interface UserProfile {
	billing: Address;
	shipping: Address;
	user_ssn: string;
	company_ssn: string;
	controlled_customer: boolean;
	customer_product: string;
	isAdmin: boolean;
	hasBillingOther: string;
	preferredShipmentMethod: PreferredShipmentMethod;
	cart?: unknown;
	disablePersonDiscount?: boolean;
}

// ─── Cart ───────────────────────────────────────────────────────

export interface CartItem {
	productId: number;
	quantity: number;
	isVariation: boolean;
	timestamp: number;
	version: number;
}

export interface CartRequest {
	cart: CartItem[];
	coupon: string | null;
}

export interface CartLineItem {
	key?: string;
	product_id: number;
	variation_id?: number;
	quantity: number;
	name?: string;
	price?: number | string;
	display_price?: number | string;
	subtotal?: number | string;
	total?: number | string;
	image?: string;
	slug?: string;
	[key: string]: unknown;
}

export interface CartResponse {
	line_items: CartLineItem[];
	total: string | number;
	subtotal: string | number;
	total_discount: string | number;
	total_tax: string | number;
	total_full: string | number;
	totals: Record<string, unknown>;
	amount: string | number;
	fees: unknown[];
	notices: unknown[];
	include_tax: boolean;
	coupons: unknown[];
}

// ─── Local cart state ───────────────────────────────────────────

export interface LocalCart {
	items: CartItem[];
	coupon: string | null;
	updatedAt: number;
}

// ─── Orders ─────────────────────────────────────────────────────

export interface OrderSummary {
	id: number;
	status: string;
	date_created: {
		date: string;
		timezone_type: number;
		timezone: string;
	};
	total: string;
	shipping_method: string;
	payment_method: string;
	payment_method_title: string;
	dk_invoice_id: string;
	dk_order_id: string;
	dk_record_id: string;
	dk_receiver: string;
}

export interface OrderDetail {
	[key: string]: unknown;
}

// ─── Product (cart-data) ────────────────────────────────────────

export interface ProductCartData {
	id: number;
	maximum_allowed_quantity: number;
	type: string;
	stock: number | null;
	lowStockThreshold: number | null;
	low_stock: boolean;
	available_stock: number | null;
	manage_stock: boolean;
	stock_status: string;
	price: number | string;
	regular_price: number | string;
	sale_price: number | string;
	display_price: number | string;
	display_full_price: number | string;
	on_sale: boolean;
	default_sale_quantity: number;
	[key: string]: unknown;
}

// ─── Typesense ──────────────────────────────────────────────────

export interface TypesenseSearch {
	collection: string;
	q: string;
	query_by: string;
	sort_by?: string;
	filter_by?: string;
	per_page?: number | string;
	page?: number;
	prefix?: boolean;
	infix?: string;
	max_candidates?: number;
	highlight_affix_num_tokens?: number;
}

export interface TypesenseMultiSearchRequest {
	searches: TypesenseSearch[];
}

export interface TypesenseHit {
	document: ProductDocument;
	highlights?: unknown[];
}

export interface TypesenseResult {
	found: number;
	out_of: number;
	page: number;
	hits: TypesenseHit[];
	search_time_ms?: number;
}

export interface TypesenseMultiSearchResponse {
	results: TypesenseResult[];
}

export interface ProductDocument {
	id: string;
	name: string;
	slug: string;
	slug_full?: string;
	excerpt?: string;
	description?: string;
	price: number;
	regular_price?: number;
	sale_price?: number;
	display_price?: number;
	display_full_price?: number;
	on_sale: boolean;
	stock_status: string;
	is_in_stock: boolean;
	lowest_price?: number;
	brand_names?: string[];
	brand_slugs?: string[];
	category_slugs?: string[];
	category_names_and_slugs?: string[];
	"image.url"?: string;
	"image.medium_url"?: string;
	"image.thumbnail_url"?: string;
	"image.alt"?: string;
	sku?: string;
	permalink?: string;
	locale?: string;
	[key: string]: unknown;
}

// ─── Checkout ───────────────────────────────────────────────────

export interface CheckoutShippingRequest {
	cart: CartItem[];
	hasPrescriptions: boolean;
	prescriptionCart: unknown[];
	prescriptionCount: number;
	destination: {
		country: string;
		postcode: string;
		street: string;
		city: string;
	};
	ssn: string;
}

export interface ShippingMethod {
	id: string;
	method_id?: string;
	instance_id?: number;
	label: string;
	cost: string | number;
	[key: string]: unknown;
}

export interface CheckoutShippingResponse {
	shippingMethods: ShippingMethod[];
	shippable: boolean;
}

export interface PaymentMethod {
	name: string;
	label: string;
	logo?: string | null;
	order: number;
}

// ─── Postcode ───────────────────────────────────────────────────

export interface PostcodeLookup {
	street1: string;
	street2: string;
	city: string;
	postalCode: string;
	country: string;
}

// ─── Dropp ──────────────────────────────────────────────────────

export interface DroppTime {
	name: string;
	time: string;
	today: boolean;
}

export interface DroppLocation {
	id: string;
	name: string;
	address: string;
	externalLocationId: string;
	gpsLatitude: number;
	gpsLongitude: number;
	pricetype: number;
	times: DroppTime[];
	[key: string]: unknown;
}

export interface DroppLocationsResponse {
	color: { nav: string; button: string };
	locations: DroppLocation[];
}
