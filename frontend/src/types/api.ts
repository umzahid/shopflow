// API contract — mirrors backend Pydantic schemas at app/schemas/*.py.
// Regenerate from /openapi.json once an OpenAPI codegen step is added.

export type ProductStatus = "draft" | "active" | "archived";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "pending_review";
export type UserRole = "customer" | "merchant" | "admin";

export interface Product {
  id: string;
  merchant_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  price: string;
  stock_qty: number;
  images: string[];
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface PaginatedProducts {
  items: Product[];
  next_cursor: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface ProductSearchResult extends Product {
  relevance_score: number;
}

export interface CartItem {
  product_id: string;
  title: string;
  qty: number;
  unit_price: string;
  line_total: string;
}

export interface Cart {
  items: CartItem[];
  subtotal: string;
}

export interface ShippingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;  // ISO-3166-1 alpha-2
}

export interface CheckoutRequest {
  shipping_address: ShippingAddress;
  coupon_code?: string;
}

export interface OrderItemResponse {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
}

export interface Order {
  id: string;
  customer_id: string;
  status: OrderStatus;
  total_amount: string;
  discount_amount: string;
  shipping_address: ShippingAddress;
  coupon_id: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItemResponse[];
  fraud_score: string | null;
  fraud_reasons: string[] | null;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RatingHistogram {
  one: number;
  two: number;
  three: number;
  four: number;
  five: number;
  total: number;
  average: number;
}

export interface Review {
  id: string;
  product_id: string;
  customer_id: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface PaginatedReviews {
  items: Review[];
  next_cursor: string | null;
  histogram: RatingHistogram;
}

export interface PaginatedOrders {
  items: Order[];
  next_cursor: string | null;
}

// --- Merchant dashboard / analytics (mirror app/schemas/dashboard.py) ---

export interface RevenueWindows {
  last_7d: string;
  last_30d: string;
  last_90d: string;
}

export interface OrderStatusCount {
  status: OrderStatus;
  count: number;
}

export interface TopProduct {
  product_id: string;
  title: string;
  units_sold: number;
  revenue: string;
}

export interface MerchantDashboard {
  revenue: RevenueWindows;
  orders_by_status: OrderStatusCount[];
  top_products: TopProduct[];
}

export interface DailyRevenue {
  day: string;
  revenue: string;
}

export interface RevenueSummary {
  start: string;
  end: string;
  series: DailyRevenue[];
}

export interface RestockAlert {
  product_id: string;
  title: string;
  current_stock: number;
  predicted_demand_units: number;
  shortfall_units: number;
  days_until_stockout: number | null;
}

export interface RestockAlertsResponse {
  lead_time_days: number;
  alerts: RestockAlert[];
}

export type DescriptionTone = "professional" | "playful" | "luxury" | "minimal";
export type DescriptionLength = "short" | "medium" | "long";

export interface DescriptionRequest {
  title: string;
  category?: string | null;
  key_features?: string[];
  tone?: DescriptionTone;
  length?: DescriptionLength;
}

export interface DescriptionResponse {
  variants: string[];
}

export interface CopilotToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
}

export interface CopilotResponse {
  answer: string;
  tool_calls: CopilotToolCall[];
}

export interface ForecastPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface ProductForecast {
  product_id: string;
  horizon_days: number;
  points: ForecastPoint[];
}

export interface TrackingStage {
  status: string;
  label: string;
  reached: boolean;
  timestamp: string | null;
}

export interface OrderTracking {
  order_id: string;
  status: OrderStatus;
  carrier: string;
  tracking_number: string;
  estimated_delivery: string | null;
  timeline: TrackingStage[];
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
  created_at: string;
}

export interface AddressInput {
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
  is_default?: boolean;
}

export interface MyReview {
  id: string;
  product_id: string;
  product_title: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface ProductSummary {
  product_id: string;
  summary: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

export interface WeeklyNarrative {
  narrative: string;
  highlights: string[];
  generated_at: string;
  cached: boolean;
}

export interface MerchantReviewItem {
  id: string;
  product_id: string;
  product_title: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface MerchantReviews {
  items: MerchantReviewItem[];
}
