import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

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
  private visitorId: string = '';
  private sessionId: string = '';
  private isNewUser: boolean = false;
  private sessionData: Partial<VisitorSession> | null = null;
  private initialized: boolean = false;
  private syncTimeout: any = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.init();
  }

  private init() {
    if (this.initialized) return;

    try {
      // 1. Resolve Visitor ID (Permanent in localStorage)
      let storedVisitorId = localStorage.getItem('fpac_visitor_id');
      if (!storedVisitorId) {
        storedVisitorId = `v_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        localStorage.setItem('fpac_visitor_id', storedVisitorId);
        this.isNewUser = true;
      } else {
        this.isNewUser = false;
      }
      this.visitorId = storedVisitorId;

      // 2. Resolve Session ID (Expires after 30 minutes of inactivity)
      let storedSessionId = localStorage.getItem('fpac_session_id');
      let storedTimestamp = localStorage.getItem('fpac_session_timestamp');
      const now = Date.now();

      if (
        !storedSessionId || 
        !storedTimestamp || 
        now - parseInt(storedTimestamp) > 30 * 60 * 1000
      ) {
        // New Session
        this.sessionId = `s_${Math.random().toString(36).substring(2, 15)}_${now}`;
        localStorage.setItem('fpac_session_id', this.sessionId);
        // If it's a new visitor, it is a new user. Otherwise, recurring.
        if (!storedVisitorId) {
          this.isNewUser = true;
        }
      } else {
        // Resume Session
        this.sessionId = storedSessionId;
      }

      // Update timestamp on activity
      localStorage.setItem('fpac_session_timestamp', now.toString());

      this.initialized = true;

      // Prefetch geo if needed
      this.loadGeoLocation();
    } catch (e) {
      console.warn('Analytics initialization failed:', e);
    }
  }

  private async loadGeoLocation(): Promise<{ city: string; region: string; country: string }> {
    try {
      const stored = localStorage.getItem('fpac_visitor_geo');
      if (stored) {
        return JSON.parse(stored);
      }

      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        const geo = {
          city: data.city || 'Desconhecido',
          region: data.region || 'Desconhecido',
          country: data.country_name || 'Desconhecido'
        };
        localStorage.setItem('fpac_visitor_geo', JSON.stringify(geo));
        return geo;
      }
    } catch (e) {
      // Silent catch
    }
    return { city: 'Desconhecido', region: 'Desconhecido', country: 'Desconhecido' };
  }

  private getDevice(): 'desktop' | 'mobile' | 'tablet' {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  private getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.indexOf("Firefox") > -1) return "Firefox";
    if (ua.indexOf("SamsungBrowser") > -1) return "Samsung Browser";
    if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) return "Opera";
    if (ua.indexOf("Trident") > -1) return "Internet Explorer";
    if (ua.indexOf("Edge") > -1 || ua.indexOf("Edg") > -1) return "Edge";
    if (ua.indexOf("Chrome") > -1) return "Chrome";
    if (ua.indexOf("Safari") > -1) return "Safari";
    return "Outro";
  }

  private getOS(): string {
    const ua = navigator.userAgent;
    if (ua.indexOf("Windows NT 10.0") > -1) return "Windows 10/11";
    if (ua.indexOf("Windows NT 6.2") > -1) return "Windows 8";
    if (ua.indexOf("Windows NT 6.1") > -1) return "Windows 7";
    if (ua.indexOf("Macintosh") > -1) return "macOS";
    if (ua.indexOf("Android") > -1) return "Android";
    if (ua.indexOf("iPhone") > -1 || ua.indexOf("iPad") > -1) return "iOS";
    if (ua.indexOf("Linux") > -1) return "Linux";
    return "Outro";
  }

  private getUTMParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign')
    };
  }

  private getReferrerOrigin(referrer: string): string {
    if (!referrer || referrer === '') return 'Tráfego Direto';
    const refLower = referrer.toLowerCase();
    
    // Check UTM source first from current URL if available
    const utms = this.getUTMParams();
    if (utms.utm_source) {
      const src = utms.utm_source.toLowerCase();
      if (src.includes('google')) return 'Google';
      if (src.includes('instagram')) return 'Instagram';
      if (src.includes('facebook')) return 'Facebook';
      if (src.includes('tiktok')) return 'TikTok';
      if (src.includes('whatsapp') || src.includes('wa.me')) return 'WhatsApp';
      return utms.utm_source; // Custom campaign source
    }

    if (refLower.includes('google')) return 'Google';
    if (refLower.includes('instagram')) return 'Instagram';
    if (refLower.includes('facebook')) return 'Facebook';
    if (refLower.includes('tiktok')) return 'TikTok';
    if (refLower.includes('whatsapp') || refLower.includes('wa.me')) return 'WhatsApp';
    
    // Search engines (organic)
    if (
      refLower.includes('bing') || 
      refLower.includes('yahoo') || 
      refLower.includes('duckduckgo') || 
      refLower.includes('search')
    ) {
      return 'Pesquisa Orgânica';
    }

    return 'Links Externos';
  }

  /**
   * Safe schedule sync to Firestore (debounced to avoid multiple requests)
   */
  private scheduleSync() {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => this.sync(), 1000);
  }

  private async sync() {
    if (!this.initialized) return;

    try {
      const geo = await this.loadGeoLocation();
      const utms = this.getUTMParams();
      const referrer = document.referrer;
      const origin = this.getReferrerOrigin(referrer);

      // Create base structure if not present
      if (!this.sessionData) {
        this.sessionData = {
          sessionId: this.sessionId,
          visitorId: this.visitorId,
          isNewUser: this.isNewUser,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActive: Date.now(),
          pagesVisited: 0,
          pages: [],
          device: this.getDevice(),
          browser: this.getBrowser(),
          os: this.getOS(),
          city: geo.city,
          region: geo.region,
          country: geo.country,
          referrer: referrer || 'Direto',
          utm_source: utms.utm_source,
          utm_medium: utms.utm_medium,
          utm_campaign: utms.utm_campaign,
          userId: null,
          userEmail: null,
          userName: null,
          userPhone: null,
          isIdentified: false,
          cartStarted: false,
          checkoutStarted: false,
          purchaseCompleted: false,
          totalSpent: 0,
          searches: [],
          viewedProducts: [],
          cartProducts: [],
          events: []
        };
      }

      // Sync active state timestamp
      this.sessionData.lastActive = Date.now();
      this.sessionData.updatedAt = new Date();
      localStorage.setItem('fpac_session_timestamp', Date.now().toString());

      const docRef = doc(db, 'visitor_sessions', this.sessionId);
      
      // We write with merge: true to avoid overwriting fields if written concurrently
      await setDoc(docRef, {
        ...this.sessionData,
        // Make sure createdAt stays as serverTimestamp if we want, but local JS Date is also fine and easier to query/sort
      }, { merge: true });

    } catch (error) {
      console.warn('Analytics sync failed:', error);
      // Fallback: don't crash app if Firestore is blocked or permission denied
    }
  }

  // --- PUBLIC API ---

  public getSessionId() {
    return this.sessionId;
  }

  public getVisitorId() {
    return this.visitorId;
  }

  /**
   * Tracks a Page View event
   */
  public async trackPageView(path: string) {
    this.init();
    
    // Build page view event
    const event: AnalyticsEvent = {
      type: 'page_view',
      path,
      timestamp: Date.now()
    };

    if (!this.sessionData) {
      this.sessionData = {
        pagesVisited: 0,
        pages: [],
        events: []
      };
    }

    const pages = this.sessionData.pages || [];
    if (!pages.includes(path)) {
      // Keep up to 50 items to prevent document size explosion
      if (pages.length < 50) {
        pages.push(path);
      }
    }

    this.sessionData.pagesVisited = (this.sessionData.pagesVisited || 0) + 1;
    this.sessionData.pages = pages;
    
    const events = this.sessionData.events || [];
    if (events.length < 100) {
      events.push(event);
    }
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Tracks a Product View event
   */
  public async trackProductView(slug: string, name: string) {
    this.init();

    const event: AnalyticsEvent = {
      type: 'product_view',
      path: `/product/${slug}`,
      timestamp: Date.now(),
      metadata: { slug, name }
    };

    if (!this.sessionData) {
      this.sessionData = { events: [], viewedProducts: [] };
    }

    const viewed = this.sessionData.viewedProducts || [];
    if (!viewed.includes(slug)) {
      if (viewed.length < 30) viewed.push(slug);
    }
    this.sessionData.viewedProducts = viewed;

    const events = this.sessionData.events || [];
    if (events.length < 100) events.push(event);
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Tracks a Category/Catalog View event
   */
  public async trackCategoryView(category: string) {
    this.init();

    const event: AnalyticsEvent = {
      type: 'category_view',
      path: `/catalog?category=${category}`,
      timestamp: Date.now(),
      metadata: { category }
    };

    if (!this.sessionData) this.sessionData = { events: [] };

    const events = this.sessionData.events || [];
    if (events.length < 100) events.push(event);
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Tracks a Search event
   */
  public async trackSearch(query: string) {
    if (!query || query.trim() === '') return;
    this.init();

    const event: AnalyticsEvent = {
      type: 'search',
      path: `/catalog?search=${query}`,
      timestamp: Date.now(),
      metadata: { query }
    };

    if (!this.sessionData) {
      this.sessionData = { events: [], searches: [] };
    }

    const searches = this.sessionData.searches || [];
    if (!searches.includes(query)) {
      if (searches.length < 20) searches.push(query);
    }
    this.sessionData.searches = searches;

    const events = this.sessionData.events || [];
    if (events.length < 100) events.push(event);
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Tracks when an item is added to cart
   */
  public async trackAddToCart(slug: string, name: string, price: number, quantity: number) {
    this.init();

    const event: AnalyticsEvent = {
      type: 'cart_add',
      path: `/bag`,
      timestamp: Date.now(),
      metadata: { slug, name, price, quantity }
    };

    if (!this.sessionData) {
      this.sessionData = { events: [], cartProducts: [], cartStarted: false };
    }

    this.sessionData.cartStarted = true;

    const cartProds = this.sessionData.cartProducts || [];
    if (!cartProds.includes(slug)) {
      if (cartProds.length < 30) cartProds.push(slug);
    }
    this.sessionData.cartProducts = cartProds;

    const events = this.sessionData.events || [];
    if (events.length < 100) events.push(event);
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Tracks when Checkout is started
   */
  public async trackCheckoutStart() {
    this.init();

    const event: AnalyticsEvent = {
      type: 'checkout_start',
      path: `/checkout`,
      timestamp: Date.now()
    };

    if (!this.sessionData) {
      this.sessionData = { events: [], checkoutStarted: false };
    }

    this.sessionData.checkoutStarted = true;

    const events = this.sessionData.events || [];
    if (events.length < 100) events.push(event);
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Tracks when a purchase is completed
   */
  public async trackPurchase(orderId: string, amount: number, items: any[]) {
    this.init();

    const event: AnalyticsEvent = {
      type: 'purchase',
      path: `/success?id=${orderId}`,
      timestamp: Date.now(),
      metadata: { orderId, amount, itemsCount: items.length }
    };

    if (!this.sessionData) {
      this.sessionData = { events: [], purchaseCompleted: false, totalSpent: 0 };
    }

    this.sessionData.purchaseCompleted = true;
    this.sessionData.totalSpent = (this.sessionData.totalSpent || 0) + amount;

    const events = this.sessionData.events || [];
    if (events.length < 100) events.push(event);
    this.sessionData.events = events;

    this.scheduleSync();
  }

  /**
   * Identifies the current user (links visitor details to logged-in or purchasing client)
   */
  public identify(userId: string, email: string, name?: string, phone?: string) {
    this.init();

    if (!this.sessionData) {
      this.sessionData = {};
    }

    this.sessionData.userId = userId;
    this.sessionData.userEmail = email;
    if (name) this.sessionData.userName = name;
    if (phone) this.sessionData.userPhone = phone;
    this.sessionData.isIdentified = true;

    this.scheduleSync();
  }
}

export const analyticsTracker = new AnalyticsTracker();
