# Jiji.ng-Style Classifieds Marketplace - Implementation Plan

> **Based on research of jiji.ng - Nigeria's largest online classifieds marketplace**

## 📋 Executive Summary

Jiji.ng is a **classifieds marketplace** (NOT an e-commerce platform) where:
- Individual sellers post ads for products/services they want to sell
- Buyers browse listings and contact sellers directly
- Payment happens **offline** between buyer and seller (Pay on Delivery)
- The platform facilitates **connections**, not transactions
- No shopping cart, no online checkout, no payment processing

## 🎯 Core Business Model

### Key Differences from E-commerce

| Feature | E-commerce (Amazon, Shopify) | Classifieds (Jiji.ng) |
|---------|------------------------------|------------------------|
| Seller Type | Registered merchants | Anyone can post ads |
| Inventory | Managed by platform | Listed by individuals |
| Payment | Online through platform | Offline between parties |
| Fulfillment | Platform handles shipping | Buyer meets seller |
| Transaction Fee | Platform takes commission | Listing fees/promotions |
| Trust Model | Platform guarantees | Buyer verifies on delivery |

### Revenue Model

1. **Free Basic Listings** - Anyone can post for free
2. **Premium Ad Placements** - VIP, Premium, Diamond, Enterprise badges
3. **Featured Listings** - Top placement in categories
4. **Promoted Ads** - Appear in trending sections
5. **Business Accounts** - For professional sellers with verification

## 🏗️ System Architecture

### 1. Core Entities

```typescript
// User/Seller
interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  accountType: 'basic' | 'verified' | 'business';
  badges: ('verified_id' | 'diamond' | 'enterprise' | 'premium')[];
  yearsOnPlatform: number;
  rating: number;
  totalAds: number;
  activeAds: number;
  location: Location;
  createdAt: Date;
}

// Listing/Ad
interface Listing {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  negotiable: boolean;
  condition: 'brand_new' | 'foreign_used' | 'nigerian_used' | 'refurbished';
  category: string;
  subcategory: string;
  images: string[]; // Multiple photos
  location: {
    state: string;
    city: string;
    area?: string;
  };
  status: 'active' | 'sold' | 'expired' | 'removed';
  views: number;
  featured: boolean;
  promotionLevel?: 'vip' | 'premium' | 'diamond' | 'enterprise';
  createdAt: Date;
  expiresAt: Date;
  attributes: Record<string, any>; // Category-specific fields
}

// Category
interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  parentId?: string; // For subcategories
  listingCount: number;
  customFields: CategoryField[]; // Dynamic form fields
}

// Example: Vehicles category has specific fields
interface VehicleAttributes {
  make: string;
  model: string;
  year: number;
  mileage: number;
  transmission: 'manual' | 'automatic';
  fuelType: string;
  condition: 'brand_new' | 'foreign_used' | 'local_used';
  bodyType: string;
}
```

## 📱 User Interface Structure

### Homepage Layout

```
┌─────────────────────────────────────────────────────┐
│  LOGO    Search Bar (Location Dropdown)    [Sell]   │
├─────────────────────────────────────────────────────┤
│  🔥 Trending | Vehicles | Property | Phones | ...   │ (Horizontal scroll)
├─────────────────────────────────────────────────────┤
│                                                      │
│  Popular Categories (Grid of 18 categories)          │
│  [🚗 Vehicles] [🏠 Property] [📱 Phones]            │
│  [💻 Electronics] [👗 Fashion] [🛋️ Furniture]      │
│                                                      │
├─────────────────────────────────────────────────────┤
│  Trending Ads                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ [Image]  │ │ [Image]  │ │ [Image]  │            │
│  │ Title    │ │ Title    │ │ Title    │            │
│  │ ₦ Price  │ │ ₦ Price  │ │ ₦ Price  │            │
│  │ Location │ │ Location │ │ Location │            │
│  │ [Badge]  │ │ [Badge]  │ │ [Badge]  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

### Listing Card Components

```tsx
// Minimal ad card info
- Featured badge (VIP, Premium, Diamond, Enterprise)
- Seller trust indicators (Verified ID, Years on Jiji)
- Quick reply badge
- Condition tag (Brand New, Foreign Used, Local Used)
- Price (large, prominent)
- Title
- Key specs (e.g., for cars: transmission, location)
- Location (state, city)
```

### Category Pages

```
Filters Sidebar              |  Listing Grid
─────────────────────────────┼──────────────────────────
Location                     │  [Sort by: Date, Price]
├─ Lagos                     │
├─ Abuja                     │  Grid of Ad Cards
└─ Port Harcourt             │  (2-3 columns)
                             │
Price Range                  │  Pagination
├─ Min: [____]               │  [1] [2] [3] ... [Next]
└─ Max: [____]               │
                             │
Condition                    │
☐ Brand New                  │
☐ Foreign Used               │
☐ Nigerian Used              │
                             │
Category-Specific Filters    │
(Dynamic based on category)  │
```

### Listing Detail Page

```
┌─────────────────────────────────────────────────────┐
│  Back to Category                                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────┐   Title                       │
│  │                  │   ₦ Price (negotiable)         │
│  │   Main Image     │                               │
│  │   (Carousel)     │   Location: Lagos, Ikeja      │
│  │                  │   Posted: 2 days ago          │
│  └──────────────────┘   Condition: Foreign Used     │
│   [Thumbnail] [...]                                 │
│                                                      │
├─────────────────────────────────────────────────────┤
│  Description                                         │
│  Full text description with details...               │
│                                                      │
│  Specifications (Category-specific)                  │
│  • Make: Toyota                                      │
│  • Model: Camry                                      │
│  • Year: 2020                                        │
│                                                      │
├─────────────────────────────────────────────────────┤
│  Seller Information                                  │
│  [Avatar] John Doe                                   │
│  ⭐ 4.5 rating | 5+ years on Jiji                   │
│  📍 Lagos                                            │
│                                                      │
│  [📞 Show Phone Number]  [💬 Chat]                  │
│                                                      │
├─────────────────────────────────────────────────────┤
│  Safety Tips                                         │
│  • Meet in a safe, public place                     │
│  • Inspect item before payment                      │
│  • Never pay upfront                                │
└─────────────────────────────────────────────────────┘
```

## 🛠️ Technical Implementation Plan

### Phase 1: Foundation (Week 1-2)

#### 1.1 Database Schema

```sql
-- Users/Sellers
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  avatar_url TEXT,
  account_type VARCHAR(20) DEFAULT 'basic',
  verified_id BOOLEAN DEFAULT false,
  business_verified BOOLEAN DEFAULT false,
  location_state VARCHAR(100),
  location_city VARCHAR(100),
  rating DECIMAL(3,2) DEFAULT 0,
  total_ratings INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  parent_id UUID REFERENCES categories(id),
  icon VARCHAR(50),
  sort_order INT,
  is_active BOOLEAN DEFAULT true
);

-- Category-specific form fields
CREATE TABLE category_fields (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id),
  field_name VARCHAR(100) NOT NULL,
  field_type VARCHAR(50), -- text, number, select, multiselect
  field_options JSONB, -- for dropdowns
  required BOOLEAN DEFAULT false,
  display_order INT
);

-- Listings/Ads
CREATE TABLE listings (
  id UUID PRIMARY KEY,
  seller_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  negotiable BOOLEAN DEFAULT true,
  condition VARCHAR(50), -- brand_new, foreign_used, nigerian_used
  location_state VARCHAR(100) NOT NULL,
  location_city VARCHAR(100) NOT NULL,
  location_area VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active', -- active, sold, expired, removed
  views INT DEFAULT 0,
  promotion_level VARCHAR(20), -- vip, premium, diamond, enterprise
  featured BOOLEAN DEFAULT false,
  attributes JSONB, -- Category-specific data
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

-- Listing Images
CREATE TABLE listing_images (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INT,
  is_primary BOOLEAN DEFAULT false
);

-- Saved/Favorite Listings
CREATE TABLE saved_listings (
  user_id UUID REFERENCES users(id),
  listing_id UUID REFERENCES listings(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

-- Seller Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  seller_id UUID REFERENCES users(id),
  reviewer_id UUID REFERENCES users(id),
  listing_id UUID REFERENCES listings(id),
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Messages/Chat
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES listings(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  sender_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 1.2 Backend API Endpoints

```typescript
// Auth
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/verify-phone
POST   /api/auth/logout

// Users/Profile
GET    /api/users/me
PUT    /api/users/me
GET    /api/users/:id/profile
GET    /api/users/:id/listings

// Categories
GET    /api/categories
GET    /api/categories/:slug
GET    /api/categories/:id/fields

// Listings
GET    /api/listings (with filters, pagination)
POST   /api/listings (create new ad)
GET    /api/listings/:id
PUT    /api/listings/:id (edit own listing)
DELETE /api/listings/:id
POST   /api/listings/:id/promote (upgrade to premium)
POST   /api/listings/:id/renew
PUT    /api/listings/:id/mark-sold

// Search
GET    /api/search?q=query&category=&location=&price_min=&price_max=

// Favorites
POST   /api/favorites/:listingId
DELETE /api/favorites/:listingId
GET    /api/favorites

// Reviews
POST   /api/reviews
GET    /api/users/:id/reviews

// Messaging
GET    /api/conversations
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages
POST   /api/listings/:id/contact (initiate conversation)

// Image Upload
POST   /api/upload/image (returns URL)
```

### Phase 2: Core Pages (Week 3-4)

#### 2.1 Frontend Pages Structure

```
src/pages/
├── index.astro                    # Homepage with categories
├── listings/
│   ├── index.astro               # All listings (with filters)
│   ├── [id].astro                # Listing detail page
│   └── new.astro                 # Post new ad form
├── categories/
│   └── [slug].astro              # Category listings page
├── search.astro                   # Search results
├── profile/
│   ├── index.astro               # User profile
│   ├── listings.astro            # User's ads
│   ├── favorites.astro           # Saved listings
│   └── messages.astro            # Inbox
├── auth/
│   ├── login.astro
│   └── register.astro
└── sell.astro                     # Post ad wizard
```

#### 2.2 Key Components

```tsx
// Listing Card - Used everywhere
<ListingCard
  id={listing.id}
  title={listing.title}
  price={listing.price}
  location={listing.location}
  images={listing.images}
  condition={listing.condition}
  promotionLevel={listing.promotionLevel}
  seller={listing.seller}
/>

// Search/Filter Bar
<SearchBar
  onSearch={handleSearch}
  categories={categories}
  locations={locations}
/>

// Category Grid
<CategoryGrid categories={categories} />

// Listing Form - Dynamic based on category
<ListingForm
  category={category}
  customFields={categoryFields}
  onSubmit={handleSubmit}
/>

// Seller Profile Card
<SellerCard
  name={seller.name}
  rating={seller.rating}
  yearsOnPlatform={seller.yearsOnPlatform}
  badges={seller.badges}
  onContact={handleContact}
/>

// Image Gallery/Carousel
<ImageGallery images={listing.images} />

// Location Filter
<LocationFilter
  states={states}
  selectedState={state}
  selectedCity={city}
  onChange={handleLocationChange}
/>
```

### Phase 3: Advanced Features (Week 5-6)

#### 3.1 Real-time Messaging

```typescript
// Using WebSocket or Pusher/Socket.io
// Buyers can chat with sellers directly
// Notification when new message arrives
```

#### 3.2 Promotion System

```typescript
interface PromotionPackage {
  level: 'vip' | 'premium' | 'diamond' | 'enterprise';
  price: number;
  duration: number; // days
  benefits: {
    featuredPlacement: boolean;
    topOfSearch: boolean;
    badge: boolean;
    highlighted: boolean;
  };
}

// Sellers can upgrade their listings
// Promoted ads appear higher in search results
```

#### 3.3 Verification System

```typescript
// ID Verification
- Upload ID card
- Phone verification (OTP)
- Email verification
- Business registration (for businesses)

// Trust badges
- Verified ID badge
- Years on platform (3+, 5+ years)
- Quick reply badge (responds within 1 hour)
```

#### 3.4 Search & Filters

```typescript
// Advanced search with multiple filters
interface SearchFilters {
  query?: string;
  categoryId?: string;
  state?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  condition?: string[];
  sellerId?: string;
  verifiedOnly?: boolean;
  sortBy?: 'date' | 'price_asc' | 'price_desc' | 'relevance';
  attributes?: Record<string, any>; // Category-specific filters
}

// Full-text search on title + description
// Elasticsearch or PostgreSQL full-text search
```

### Phase 4: Mobile & PWA (Week 7-8)

- Responsive design (mobile-first)
- Progressive Web App features
- Push notifications for new messages
- Image compression for uploads
- Offline mode for browsing

## 🎨 Design Specifications

### Color Scheme (Jiji.ng Style)

```css
:root {
  --primary: #FF6B35;      /* Orange/Red - CTA buttons */
  --primary-dark: #E85D2E;
  --secondary: #4ECDC4;    /* Teal - accents */
  --success: #44AF69;
  --warning: #FCAB10;
  --danger: #F95738;
  
  --text-dark: #2D3748;
  --text-medium: #4A5568;
  --text-light: #A0AEC0;
  
  --bg-primary: #FFFFFF;
  --bg-secondary: #F7FAFC;
  --bg-tertiary: #EDF2F7;
  
  --border: #E2E8F0;
}
```

### Typography

```css
/* Headings */
h1: font-size: 32px, font-weight: 700
h2: font-size: 24px, font-weight: 600
h3: font-size: 20px, font-weight: 600

/* Body */
body: font-size: 16px, line-height: 1.6
small: font-size: 14px

/* Prices */
.price: font-size: 24px, font-weight: 700, color: primary
```

### Layout Principles

1. **Dense information display** - Show many listings per page
2. **Card-based layout** - Each listing is a card
3. **Prominent CTAs** - "Post Ad" and "Contact Seller" buttons
4. **Trust indicators** - Badges, ratings, verification visible
5. **Mobile-first** - Most users browse on mobile

## 🔐 Security Considerations

### User Safety

1. **Phone verification** - Required for posting ads
2. **Safety tips** - Displayed on every listing page
3. **Report listing** - Flag suspicious ads
4. **Block users** - Prevent harassment
5. **Moderation** - Admin review of flagged content

### Platform Security

1. **Rate limiting** - Prevent spam posting
2. **Image moderation** - Detect inappropriate content
3. **Duplicate detection** - Prevent same ad multiple times
4. **Captcha** - On registration and posting
5. **XSS/SQL injection protection**

## 📊 Metrics & Analytics

### Key Metrics to Track

```typescript
// Listing metrics
- Total listings
- Active listings by category
- Average listing duration
- Conversion rate (views → contact)

// User metrics
- Total users
- Active sellers
- Verified sellers
- Repeat posters

// Engagement
- Daily active users
- Search queries
- Messages sent
- Favorites added

// Revenue
- Premium upgrades
- Featured listings
- Enterprise accounts
```

## 🚀 Deployment Strategy

### Infrastructure

```
Frontend: Vercel/Netlify (Astro static site)
Backend: Node.js API on Railway/Fly.io/AWS
Database: PostgreSQL (Neon/Supabase)
Image Storage: Cloudinary/AWS S3
Search: Meilisearch/Algolia/PostgreSQL FTS
Real-time: Pusher/Socket.io/Supabase Realtime
CDN: Cloudflare
```

### Environment Setup

```env
# Database
DATABASE_URL=postgresql://...

# Image Upload
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# SMS (for OTP)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Email
RESEND_API_KEY=

# Search
MEILISEARCH_HOST=
MEILISEARCH_API_KEY=

# Real-time
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
```

## 📝 Implementation Checklist

### Backend
- [ ] Set up PostgreSQL database with schema
- [ ] Implement user authentication (JWT)
- [ ] Create listings CRUD API
- [ ] Implement category system with custom fields
- [ ] Add search and filtering
- [ ] Image upload to cloud storage
- [ ] Messaging system
- [ ] Review/rating system
- [ ] Promotion/featured ads logic
- [ ] Admin moderation panel

### Frontend
- [ ] Set up Astro with TypeScript + Tailwind
- [ ] Homepage with category grid
- [ ] Category listing pages with filters
- [ ] Listing detail page
- [ ] Post ad form (multi-step wizard)
- [ ] User profile pages
- [ ] Search functionality
- [ ] Messaging interface
- [ ] Responsive design (mobile-first)
- [ ] Image optimization and lazy loading

### Testing
- [ ] Unit tests for critical functions
- [ ] Integration tests for API endpoints
- [ ] E2E tests for user flows
- [ ] Load testing for search
- [ ] Security audit

## 🎯 Success Criteria

A successful jiji.ng-style marketplace should:

1. ✅ Allow anyone to post ads quickly (< 2 minutes)
2. ✅ Display hundreds of listings efficiently
3. ✅ Make it easy to filter and find relevant items
4. ✅ Connect buyers and sellers seamlessly
5. ✅ Build trust through verification and ratings
6. ✅ Work flawlessly on mobile devices
7. ✅ Load pages in < 2 seconds
8. ✅ Handle 10,000+ concurrent users

## 🔄 Next Steps

1. **Review this plan** and confirm the scope
2. **Set up the database** schema
3. **Build the backend API** first
4. **Create frontend pages** incrementally
5. **Test with real users** early
6. **Iterate based on feedback**

---

**Note**: This is a comprehensive plan. For MVP, focus on Phase 1-2 first (Weeks 1-4), which covers:
- User registration/login
- Post/browse listings
- Basic search and filters
- Listing detail with seller contact
- Essential categories setup

Then expand to advanced features based on user feedback.
