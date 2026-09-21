import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { analyticsAllowed, PRIVACY_EVENT } from './privacyPreferences';
import { publicAnalyticsPath } from '../../shared/privacy';

export interface AnalyticsEvent {
  type: 'page_view' | 'product_view' | 'category_view' | 'search' | 'cart_start' | 'cart_add' | 'checkout_start' | 'purchase';
  path: string;
  timestamp: number;
  metadata?: any;
}

export interface VisitorSession {
  sessionId: string;
  visitorId: string;
  isNewUser: boolean;
  createdAt: any;
  updatedAt: any;
  lastActive: number;
  pagesVisited: number;
  pages: string[];
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  city: string;
  region: string;
  country: string;
  referrer: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userPhone: string | null;
  isIdentified: boolean;
  cartStarted: boolean;
  checkoutStarted: boolean;
  purchaseCompleted: boolean;
  totalSpent: number;
  searches: string[];
  viewedProducts: string[]; // List of product slugs/names viewed
  cartProducts: string[]; // List of product slugs added to cart
  events: AnalyticsEvent[];
}

class AnalyticsTracker {
  private sessionData: VisitorSession | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    const preferencesChanged = () => {
      if (this.syncTimeout) clearTimeout(this.syncTimeout);
      this.sessionData = null;
      if (analyticsAllowed()) void this.trackPageView(window.location.pathname);
    };
    window.addEventListener(PRIVACY_EVENT, preferencesChanged);
    window.addEventListener('storage', event => { if (event.key === 'fpac_privacy_v1') preferencesChanged(); });
  }

  private init(): boolean {
    if (!analyticsAllowed()) return false;
    if (this.sessionData) return true;
    try {
      const previousVisitor = localStorage.getItem('fpac_visitor_id');
      const visitorId = previousVisitor || crypto.randomUUID();
      localStorage.setItem('fpac_visitor_id', visitorId);
      const previousSession = sessionStorage.getItem('fpac_analytics_session');
      const stored = previousSession ? JSON.parse(previousSession) : null;
      const sessionId = stored?.expiresAt > Date.now() ? stored.id : 's_' + crypto.randomUUID();
      sessionStorage.setItem('fpac_analytics_session', JSON.stringify({ id: sessionId, expiresAt: Date.now() + 30 * 60_000 }));
      const ua = navigator.userAgent;
      let referrer = 'Direto';
      try { if (document.referrer) referrer = new URL(document.referrer).origin; } catch { /* no raw referrer */ }
      this.sessionData = {
        sessionId, visitorId, isNewUser: !previousVisitor, createdAt: new Date(), updatedAt: new Date(), lastActive: Date.now(),
        pagesVisited: 0, pages: [], device: /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop',
        browser: /Firefox/i.test(ua) ? 'Firefox' : /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Outro',
        os: /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : 'Outro',
        city: 'Não coletado', region: 'Não coletado', country: 'Não coletado', referrer,
        utm_source: null, utm_medium: null, utm_campaign: null,
        userId: null, userEmail: null, userName: null, userPhone: null, isIdentified: false,
        cartStarted: false, checkoutStarted: false, purchaseCompleted: false, totalSpent: 0,
        searches: [], viewedProducts: [], cartProducts: [], events: [],
      };
      return true;
    } catch { return false; }
  }

  private record(type: AnalyticsEvent['type'], path: string, metadata?: any) {
    if (!this.init()) return;
    const data = this.sessionData!;
    if (data.events.length < 100) data.events.push({ type, path, timestamp: Date.now(), ...(metadata ? { metadata } : {}) });
    data.lastActive = Date.now(); data.updatedAt = new Date();
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => void this.sync(), 1500);
  }

  private async sync() {
    if (!analyticsAllowed() || !this.sessionData) return;
    try {
      await setDoc(doc(db, 'visitor_sessions', this.sessionData.sessionId), this.sessionData, { merge: true });
    } catch { /* Optional analytics never blocks a purchase. */ }
  }

  public getSessionId() { return analyticsAllowed() ? this.sessionData?.sessionId || '' : ''; }
  public getVisitorId() { return analyticsAllowed() ? this.sessionData?.visitorId || '' : ''; }

  public async trackPageView(raw: string) {
    const path = publicAnalyticsPath(raw);
    if (!path || !this.init()) return;
    const data = this.sessionData!;
    data.pagesVisited++;
    if (!data.pages.includes(path) && data.pages.length < 50) data.pages.push(path);
    this.record('page_view', path);
  }
  public async trackProductView(slug: string, name: string) {
    if (!this.init()) return;
    const cleanSlug = slug.split(/[?#]/)[0].slice(0, 150);
    if (!this.sessionData!.viewedProducts.includes(cleanSlug) && this.sessionData!.viewedProducts.length < 30) this.sessionData!.viewedProducts.push(cleanSlug);
    this.record('product_view', '/product/' + cleanSlug, { slug: cleanSlug, name: name.slice(0, 150) });
  }
  public async trackCategoryView(category: string) {
    this.record('category_view', '/catalog', { category: category.slice(0, 80) });
  }
  public async trackSearch(query: string) {
    if (query.trim()) this.record('search', '/catalog', { queryLength: Math.min(query.length, 200) });
  }
  public async trackAddToCart(slug: string, name: string, price: number, quantity: number) {
    if (!this.init()) return;
    this.sessionData!.cartStarted = true;
    if (!this.sessionData!.cartProducts.includes(slug) && this.sessionData!.cartProducts.length < 30) this.sessionData!.cartProducts.push(slug.slice(0, 150));
    this.record('cart_add', '/bag', { slug: slug.slice(0, 150), name: name.slice(0, 150), price, quantity });
  }
  public async trackCheckoutStart() {
    if (!this.init()) return;
    this.sessionData!.checkoutStarted = true;
    this.record('checkout_start', '/checkout');
  }
  public async trackPurchase(_orderId: string, amount: number, items: any[]) {
    if (!this.init()) return;
    this.sessionData!.purchaseCompleted = true;
    this.sessionData!.totalSpent += Number.isFinite(amount) ? amount : 0;
    this.record('purchase', '/success', { amount, itemsCount: items.length });
  }
  // Customer identity belongs to authenticated profiles/orders, not navigation telemetry.
  public identify(_userId: string, _email: string, _name?: string, _phone?: string) {}
}

export const analyticsTracker = new AnalyticsTracker();
