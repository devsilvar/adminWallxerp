# **COMPLETE DETAILED IMPLEMENTATION PLAN - ALL PHASES**

---

## **OVERVIEW**
- **Type**: Classifieds Marketplace (Pay on Delivery)
- **Tech Stack**: Node.js + Express + PostgreSQL (Backend) | Astro + React (Frontend)
- **User Management**: Shared with User Dashboard (JWT auth)
- **Payment**: Offline - sellers add account details, buyers pay directly
- **Ad System**: Paid promoted ads (admin approval required)

---

## **PHASE 1: BACKEND - Core Foundation (Days 1-4)**

### **1.1 Project Setup & Database Schema**

#### **A. Backend Project Structure**
```
marketplaceBackend/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── env.js
│   ├── models/
│   │   ├── User.js (reference only)
│   │   ├── Category.js
│   │   ├── Product.js
│   │   ├── ProductImage.js
│   │   ├── SellerPaymentDetail.js
│   │   ├── PromotedAd.js
│   │   ├── PromotionPricing.js
│   │   ├── State.js
│   │   └── City.js
│   ├── routes/
│   │   ├── categories.js
│   │   ├── products.js
│   │   ├── auth.js
│   │   └── index.js
│   ├── controllers/
│   │   ├── categoryController.js
│   │   ├── productController.js
│   │   └── authController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── upload.js
│   │   ├── validate.js
│   │   └── errorHandler.js
│   ├── utils/
│   │   ├── validator.js
│   │   └── helpers.js
│   ├── seeders/
│   │   ├── categories.js
│   │   ├── locations.js
│   │   └── pricing.js
│   └── server.js
├── uploads/
│   └── products/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

#### **B. Database Schema (Complete)**

```sql
-- ============================================
-- USERS TABLE (Reference - managed by User Dashboard)
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    whatsapp_number VARCHAR(20),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CATEGORIES TABLE (Hierarchical)
-- ============================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    icon VARCHAR(50),
    image_url VARCHAR(500),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    
    -- Basic Info
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    condition VARCHAR(20) NOT NULL CHECK (condition IN ('new', 'used', 'refurbished')),
    
    -- Location
    state VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    
    -- Status & Moderation
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'sold')),
    rejection_reason TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    
    -- Metadata
    views_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    expires_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PRODUCT IMAGES (Max 3)
-- ============================================
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    display_order INTEGER DEFAULT 0 CHECK (display_order IN (0, 1, 2)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SELLER PAYMENT DETAILS
-- ============================================
CREATE TABLE seller_payment_details (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    additional_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PROMOTED ADS
-- ============================================
CREATE TABLE promoted_ads (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Request Details
    days_requested INTEGER NOT NULL,
    price_per_day DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    
    -- Status & Moderation
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'expired')),
    rejection_reason TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- Active Period (set when approved)
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    
    -- Placement
    placement VARCHAR(50) DEFAULT 'homepage' CHECK (placement IN ('homepage', 'category', 'both')),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PROMOTION PRICING (Admin Configurable)
-- ============================================
CREATE TABLE promotion_pricing (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE UNIQUE,
    price_per_day DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DEFAULT PROMOTION PRICING (Global)
-- ============================================
CREATE TABLE default_promotion_pricing (
    id SERIAL PRIMARY KEY,
    price_per_day DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NIGERIAN STATES
-- ============================================
CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE
);

-- ============================================
-- NIGERIAN CITIES
-- ============================================
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    state_id INTEGER REFERENCES states(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

-- ============================================
-- ADMIN LOGS (Track Admin Actions)
-- ============================================
CREATE TABLE admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_user ON products(user_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_location ON products(state, city);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_created ON products(created_at DESC);
CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_promoted_ads_product ON promoted_ads(product_id);
CREATE INDEX idx_promoted_ads_status ON promoted_ads(status);
CREATE INDEX idx_promoted_ads_dates ON promoted_ads(start_date, end_date);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_cities_state ON cities(state_id);
```

#### **C. Initial Dependencies**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "pg-hstore": "^2.3.4",
    "sequelize": "^6.35.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "express-validator": "^7.0.1",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "morgan": "^1.10.0",
    "compression": "^1.7.4",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### **1.2 Category Management API**

#### **Endpoints:**
```
POST   /api/categories              - Create category (admin only)
GET    /api/categories              - Get all categories (tree structure)
GET    /api/categories/flat         - Get flat list
GET    /api/categories/:id          - Get single category
PUT    /api/categories/:id          - Update category (admin only)
DELETE /api/categories/:id          - Delete category (admin only)
GET    /api/categories/:id/children - Get subcategories
```

### **1.3 Product CRUD API**

#### **Endpoints:**
```
POST   /api/products               - Create product (authenticated)
GET    /api/products               - Get all approved products (public)
GET    /api/products/:id           - Get single product detail
PUT    /api/products/:id           - Update product (owner only)
DELETE /api/products/:id           - Delete product (owner only)
PATCH  /api/products/:id/status    - Update status (admin only)
GET    /api/products/user/me       - Get current user's products
```

### **1.4 Authentication Middleware**

- JWT token verification
- Role-based access control (user/admin)
- Ownership validation

## **DELIVERABLES - PHASE 1:**
✅ Backend project structure  
✅ PostgreSQL database with complete schema  
✅ Category CRUD API with seed data  
✅ Product CRUD API  
✅ Authentication middleware (JWT)  
✅ Error handling middleware  
✅ Input validation  

**Estimated Time: 3-4 days**

---

## **PHASE 2: BACKEND - Product Features (Days 5-8)**

### **2.1 Image Upload System**

#### **Features:**
- Multer middleware for file uploads
- Max 3 images per product (5MB each)
- Image types: JPEG, PNG, WebP
- File storage in `/uploads/products/`
- Image reordering capability

#### **Endpoints:**
```
POST   /api/products/:id/images         - Upload images (max 3)
DELETE /api/products/:id/images/:imageId - Delete image
PUT    /api/products/:id/images/order   - Reorder images
```

### **2.2 Search & Filter System**

#### **Search Parameters:**
- Text search (title, description)
- Category (with subcategories)
- Price range (min/max)
- Location (state, city)
- Condition (new/used/refurbished)
- Sort (recent, price_asc, price_desc)
- Pagination (page, limit)

#### **Endpoint:**
```
GET /api/products/search?q=iphone&category=10&minPrice=50000&maxPrice=1000000&state=Lagos&condition=new&sort=price_asc&page=1&limit=20
```

### **2.3 Location Management**

#### **Data:**
- All 36 Nigerian states + FCT
- Major cities for each state

#### **Endpoints:**
```
GET /api/locations/states          - Get all states
GET /api/locations/cities/:stateId - Get cities by state
```

### **2.4 Seller Payment Details**

#### **Endpoints:**
```
POST   /api/seller/payment-details       - Add/Update payment details
GET    /api/seller/payment-details       - Get own details
GET    /api/seller/:userId/payment-details - Get seller's public details
```

## **DELIVERABLES - PHASE 2:**
✅ Image upload system (max 3 images)  
✅ Search & filter API (all parameters)  
✅ Nigerian states & cities database  
✅ Location endpoints  
✅ Seller payment details CRUD  

**Estimated Time: 4 days**

---

## **PHASE 3: BACKEND - Admin & Promoted Ads (Days 9-12)**

### **3.1 Admin Product Approval System**

#### **Endpoints:**
```
GET    /api/admin/products/pending      - Get pending products
PATCH  /api/admin/products/:id/approve  - Approve product
PATCH  /api/admin/products/:id/reject   - Reject product (with reason)
GET    /api/admin/products/stats        - Get approval stats
GET    /api/admin/logs                  - Get admin action logs
```

### **3.2 Promoted Ads System**

#### **Pricing:**
- Default: ₦500/day
- Category-specific pricing (adjustable by admin)
- Premium categories: Vehicles (₦1000/day), Real Estate (₦1500/day)

#### **User Endpoints:**
```
GET    /api/promotions/pricing/:categoryId - Get pricing for category
POST   /api/promotions/request             - Request ad promotion
GET    /api/promotions/my-requests         - Get user's requests
GET    /api/promotions/active              - Get user's active promotions
```

#### **Admin Endpoints:**
```
GET    /api/admin/promotions/pending    - Get pending promotion requests
PATCH  /api/admin/promotions/:id/approve - Approve promotion
PATCH  /api/admin/promotions/:id/reject  - Reject promotion
GET    /api/admin/promotions/active     - Get all active promotions
PUT    /api/admin/promotions/pricing    - Update pricing
```

#### **Public Endpoint:**
```
GET    /api/promotions/active-ads       - Get currently promoted products
```

### **3.3 Cron Job - Auto-Expire Promotions**

- Runs every hour
- Checks for expired promotions (end_date < now)
- Updates status from 'active' to 'expired'

## **DELIVERABLES - PHASE 3:**
✅ Admin product approval system  
✅ Admin promotion approval system  
✅ Promotion pricing (default + category-specific)  
✅ Promotion request flow  
✅ Active promotions endpoint  
✅ Auto-expire promotions (cron job)  
✅ Admin action logs  

**Estimated Time: 4 days**

---

## **PHASE 4: FRONTEND - Public Marketplace (Days 13-18)**

### **4.1 Homepage**

#### **Components:**
- Hero section with search bar
- Promoted ads carousel (auto-slide every 5s)
- Category grid (all top-level categories)
- Recent products grid (latest 12 listings)

#### **File:** `src/pages/index.astro`

### **4.2 Product Listing Page**

#### **Components:**
- Filter sidebar (category, price, location, condition)
- Product grid with sorting (recent, price)
- Pagination controls
- Results count

#### **Features:**
- URL-based filters (shareable links)
- Cascading location dropdown (state → city)
- Clear filters button

#### **File:** `src/pages/products/index.astro`

### **4.3 Product Detail Page**

#### **Components:**
- Image gallery (3 images with thumbnails)
- Product info (title, price, description, location, category)
- Seller card (name, contact buttons, payment details)
- Related products section (same category)

#### **Features:**
- WhatsApp contact button (pre-filled message)
- Call button (tel: link)
- Payment details display (bank, account number, account name)
- View count increment

#### **File:** `src/pages/products/[id].astro`

### **4.4 Shared Components**

#### **ProductCard:**
- Product image (with lazy loading)
- Title, price, location
- Condition badge
- View count
- Featured badge (for promoted ads)

#### **Navbar:**
- Logo
- Search bar
- Categories dropdown
- Mobile hamburger menu

#### **Footer:**
- Quick links
- Categories
- Contact info

## **DELIVERABLES - PHASE 4:**
✅ Homepage with hero, categories, promoted ads  
✅ Product listing page with filters  
✅ Product detail page with gallery  
✅ Seller contact card with payment info  
✅ Search functionality  
✅ Responsive design (mobile, tablet, desktop)  

**Estimated Time: 6 days**

---

## **PHASE 5: FRONTEND - Category Pages (Days 19-20)**

### **5.1 Category Page**

#### **Components:**
- Category header (name, description)
- Subcategories chips/badges
- Promoted ads section (category-specific)
- Product listing (filtered by category)
- Filter sidebar (without category filter)

#### **Features:**
- Breadcrumb navigation (Home > Electronics > Phones)
- Subcategory quick links
- All filtering/sorting from product listing page

#### **File:** `src/pages/categories/[slug].astro`

## **DELIVERABLES - PHASE 5:**
✅ Category pages with subcategories  
✅ Category-specific promoted ads  
✅ Category filtering  

**Estimated Time: 2 days**

---

## **PHASE 6: INTEGRATION & POLISH (Days 21-24)**

### **6.1 API Integration**

#### **API Client (`src/lib/api.ts`):**
- Centralized API calls
- Products, categories, locations, promotions
- Error handling

### **6.2 Loading States & Error Handling**

#### **Components:**
- Spinner component (sm, md, lg sizes)
- Error message component (with retry)
- Empty state component (no results)

### **6.3 Responsive Design**

#### **Mobile Navigation:**
- Hamburger menu
- Slide-out sidebar
- Category list
- Search link

#### **Breakpoints:**
- Mobile: 320px - 767px
- Tablet: 768px - 1023px
- Desktop: 1024px+

### **6.4 SEO Optimization**

#### **Meta Tags:**
- Title, description
- Open Graph (Facebook, LinkedIn)
- Twitter Card
- Structured data (Product schema)

#### **Performance:**
- Image lazy loading
- API response caching (5 minutes)
- Code splitting (client:load directives)

## **DELIVERABLES - PHASE 6:**
✅ API client utility  
✅ Loading states  
✅ Error handling  
✅ Empty states  
✅ Mobile navigation  
✅ SEO meta tags & structured data  
✅ Performance optimizations  

**Estimated Time: 4 days**

---

## **PHASE 7: TESTING & DEPLOYMENT (Days 25-28)**

### **7.1 Testing**

#### **Backend:**
- All API endpoints (Postman/Insomnia)
- Authentication & authorization
- Image upload (size, type, count limits)
- Search & filter combinations
- Admin approval flows
- Cron job (manual trigger test)

#### **Frontend:**
- All pages load correctly
- Filters work (all combinations)
- Search functionality
- Product detail displays all info
- Contact buttons work (WhatsApp, call)
- Responsive on all devices
- Cross-browser (Chrome, Firefox, Safari, Edge)

#### **User Flows:**
- Buyer: Browse → Filter → View → Contact
- Seller: Create product → Upload images → Request promotion
- Admin: Approve products → Approve promotions → Update pricing

### **7.2 Environment Setup**

#### **Backend `.env`:**
```
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/marketplace_prod
JWT_SECRET=super_secure_random_string
CORS_ORIGIN=https://yourdomain.com
```

#### **Frontend `.env`:**
```
PUBLIC_API_URL=https://api.yourdomain.com
```

### **7.3 Database Migration**

- Run schema SQL on production database
- Seed states, cities, categories
- Set default promotion pricing

### **7.4 Deployment**

#### **Backend Options:**
- **VPS:** DigitalOcean, AWS EC2, Linode (with PM2 + Nginx)
- **PaaS:** Heroku, Railway, Render

#### **Frontend Options:**
- **Recommended:** Netlify, Vercel (Astro optimized)
- **Traditional:** cPanel, FTP upload

### **7.5 Post-Deployment**

- SSL certificate (HTTPS)
- CORS configuration
- Database backups
- Error monitoring (Sentry)
- Analytics (Google Analytics)
- Uptime monitoring

## **DELIVERABLES - PHASE 7:**
✅ Complete testing (API, frontend, user flows)  
✅ Database seeded  
✅ Backend deployed  
✅ Frontend deployed  
✅ SSL configured  
✅ Monitoring setup  

**Estimated Time: 4 days**

---

## **SUMMARY & TIMELINE**

| Phase | Focus | Duration | Days |
|-------|-------|----------|------|
| **Phase 1** | Backend Core (DB, Categories, Products) | 3-4 days | 1-4 |
| **Phase 2** | Backend Features (Images, Search, Payments) | 4 days | 5-8 |
| **Phase 3** | Backend Admin (Approvals, Promotions) | 4 days | 9-12 |
| **Phase 4** | Frontend Public (Homepage, Listing, Detail) | 6 days | 13-18 |
| **Phase 5** | Frontend Categories | 2 days | 19-20 |
| **Phase 6** | Integration & Polish | 4 days | 21-24 |
| **Phase 7** | Testing & Deployment | 4 days | 25-28 |
| **TOTAL** | | **27-28 days** | **~4 weeks** |

---

## **FUTURE ENHANCEMENTS (Post-MVP)**

### **Priority 1 (Next Sprint):**
- Email notifications (product approved, promotion approved)
- User reviews & ratings for sellers
- Wishlist/Favorites functionality
- Product reporting (flag inappropriate ads)

### **Priority 2:**
- **Messaging system** (buyer-seller chat)
- Advanced search (autocomplete, saved filters)
- Seller analytics dashboard (views, contacts)
- Multiple payment methods support

### **Priority 3:**
- Mobile apps (React Native)
- Video support for products
- AI-powered category suggestions
- Multi-language support

---

## **KEY DOCUMENTATION FILES TO CREATE**

```
marketplaceBackend/
├── README.md                  # Setup instructions
├── API_DOCUMENTATION.md       # All endpoints with examples
├── DEPLOYMENT.md              # Deployment guide
└── POSTMAN_COLLECTION.json    # API testing collection

marketplaceFrontend/
├── README.md                  # Setup instructions
├── DEPLOYMENT.md              # Build & deploy guide
└── COMPONENTS.md              # Component documentation
```

---

**This is your complete, phased implementation plan. Each phase builds on the previous one and can be implemented and tested independently.**

**Ready to start Phase 1? 🚀**
