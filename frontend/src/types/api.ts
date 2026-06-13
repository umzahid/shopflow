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

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}
