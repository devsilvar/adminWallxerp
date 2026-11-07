# **PHASE 1: BACKEND CORE FOUNDATION - DETAILED SPECIFICATION**

**Duration:** 3-4 days  
**Status:** Planning  
**Last Updated:** October 27, 2026

---

## **TABLE OF CONTENTS**

1. [Overview](#overview)
2. [Technology Stack & Architecture Decisions](#technology-stack--architecture-decisions)
3. [Critical Questions & Clarifications Needed](#critical-questions--clarifications-needed)
4. [Project Structure](#project-structure)
5. [Database Design Deep Dive](#database-design-deep-dive)
6. [API Architecture & Best Practices](#api-architecture--best-practices)
7. [Authentication & Authorization](#authentication--authorization)
8. [Error Handling Strategy](#error-handling-strategy)
9. [Validation Strategy](#validation-strategy)
10. [Implementation Checklist](#implementation-checklist)
11. [Testing Strategy](#testing-strategy)
12. [Edge Cases & Considerations](#edge-cases--considerations)

---

## **OVERVIEW**

Phase 1 establishes the foundation of the marketplace backend:
- PostgreSQL database with complete schema
- Express.js REST API with clean architecture
- JWT-based authentication (shared with User Dashboard)
- Category management (hierarchical structure)
- Product CRUD operations
- Input validation & error handling

**Key Principle:** Build a solid foundation that won't require refactoring as the system scales.

---

## **TECHNOLOGY STACK & ARCHITECTURE DECISIONS**

### **Core Technologies (Confirmed)**
- **Runtime:** Node.js 22.23.4+ LTS
- **Framework:** Express.js 4.x
- **Database:** PostgreSQL 14+ (or latest stable)
- **Language:** JavaScript (or TypeScript?)

### **ORM/Query Builder Decision (NEEDS DECISION)**

Based on research ([source](https://chat2db.ai/resources/blog/prisma-vs-sequelize)), here are the options:

#### **Option 1: Prisma (RECOMMENDED)**

**Pros:**
- Type-safe queries (especially with TypeScript)
- Excellent developer experience with Prisma Studio
- Auto-generated migrations from schema
- Better performance than Sequelize
- Growing ecosystem and active maintenance
- Schema-first approach (easier to version control)

**Cons:**
- Newer than Sequelize (less legacy support)
- Requires code generation step (`prisma generate`)
- Slightly more opinionated

**Research consensus:** "Prisma is all about boosting developer productivity" ([source](https://medium.com/@aman.ahmed1897/sequelize-vs-typeorm-vs-prisma))

#### **Option 2: Sequelize**

**Pros:**
- Mature, battle-tested (10+ years)
- Traditional ORM (familiar to many devs)
- More flexible query building
- No build step required

**Cons:**
- Less type-safe (even with TypeScript)
- More boilerplate code
- Slower query performance
- ActiveRecord pattern can lead to N+1 queries

#### **Option 3: Raw SQL with `pg` driver**

**Pros:**
- Maximum performance
- Full SQL control
- No ORM overhead
- Simpler connection pooling

**Cons:**
- Manual migration management
- More boilerplate
- SQL injection risk (must parameterize carefully)
- No type safety

### **🔴 DECISION REQUIRED:**
**Which ORM/query approach should we use?**
- [ - ] Prisma (recommended for type safety + DX)
- [ ] Sequelize (familiar, mature)
- [ ] Raw SQL with pg (performance-first)

**My recommendation:** Prisma if using TypeScript, Sequelize if staying with plain JavaScript.

---

### **Additional Dependencies**

Based on [Express.js best practices research](https://dev.to/teguh_coding/stop-writing-spaghetti-api-routes-a-practical-guide-to-clean-expressjs-architecture-3ba7):

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "morgan": "^1.10.0",
    "express-rate-limit": "^7.1.5",
    "express-validator": "^7.0.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    
    // IF Prisma:
    "@prisma/client": "^5.7.0",
    
    // IF Sequelize:
    "sequelize": "^6.35.0",
    "pg-hstore": "^2.3.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "prisma": "^5.7.0"  // IF Prisma
  }
}
```

---

## **CRITICAL QUESTIONS & CLARIFICATIONS NEEDED**

Before implementation, I need clarity on these points:

### **🔴 1. TypeScript or JavaScript?**
- **Question:** Should the backend be TypeScript or plain JavaScript?
- **Impact:** Affects tooling, ORM choice, type safety, and development speed
- **Recommendation:** TypeScript for better maintainability, especially with Prisma

**Your answer:**
- [ - ] TypeScript (recommended)
- [ ] JavaScript

---

### **🔴 2. Authentication Strategy**

You mentioned auth is shared with "User Dashboard." I need to understand:

**Questions:**
- Is the User Dashboard a completely separate codebase/service? --look at the backend folder under adminFrontend, that is the backend for teh userdashbor di am talking about  
- Where are users stored? (Same PostgreSQL database or different?) --postgress databse but the databse is hosted on railway. postgress databse , while teh test databse is on supabas eyou can find them in the same backedn folder cause you are adding the backedn for this marketplace also there too ----i dont kwno if it woudl be to much but eficenctly it is another wing in that backedn infrastucture that conectetx with it cause the marketplace is for user who alsready have an acocunt with use in teh dashbord.
- Who issues the JWT tokens? (User Dashboard API or this Marketplace API?) .they can only login... and teh auth details is forn teh one they used to sign in to teh user dashbord.
- What's in the JWT payload? (user_id, email, role?) --check teh codebae to confirm that.
- Do we validate tokens by checking the database, or just verify the JWT signature? --check teh backend folder to verfify or confirm that.
- Is there a refresh token system, or just access tokens? yes tehre is a refresh toke you can find that out in teh backend folder ispoke to you about...


**Current assumption:**
- User Dashboard and Marketplace share the same PostgreSQL database - yes
- User Dashboard issues JWT tokens -- yes
- Marketplace validates JWT signature only (no DB lookup) -- yes if that is best practivces and is goo dto go...
- JWT contains: `{ id, email, role }` --not sue checke the backend folder for to confrm that.



**Is this correct?** Please clarify the auth flow.

---

### **🔴 3. Database Connection Details**

**Questions:**
- Will you provide the PostgreSQL connection string, or should I include setup instructions? check teh test url in teh env it is there but i need the migrations too so when i push the railway it creates approritely in teh postgress databse there.
- Preferred database name? (e.g., `marketplace_dev`, `marketplace_prod`) marketplace_dev, but it has to be added to the databse for the backend folder.
- Do you have existing users in the database, or should I create dummy users for testing? --we have user for teh dahsbod in the databse , the test databse...
- Should I create a separate DB user with limited permissions, or use the default `postgres` user?  --use teh posgress databse we are using in teh backend --teh databse url are there that you can use to teste just ensure that every migration is recorded so when i oush to railway it is also created these tables tehre too in rialway postgress databse.


**Connection pooling settings ([research](https://grizzlypeaksoftware.com/library/connection-pooling-in-nodejs-postgresql-and-mongodb-pn3apzgq)):**
```javascript
{
  max: 20,              // Max connections in pool
  min: 5,               // Min idle connections
  idle: 10000,          // Close idle connections after 10s
  acquire: 30000,       // Max wait time to acquire connection
  connectionTimeoutMillis: 2000
}
```

**Are these values appropriate for your expected load?** --increase by what you feel is industry standard for a production appp...

---

### **🔴 4. API Versioning**

**Question:** Should the API be versioned from the start? yes

**Options:**
- `/api/v1/products` (versioned)
- `/api/products` (unversioned, simpler initially)

**Recommendation:** Start unversioned (`/api/*`), add versioning later if needed.

**Your preference?**

---

### **🔴 5. Environment Variables**

**Questions:**
- Should I create a `.env.example` file with placeholder values?
- Do you use any secret management service (AWS Secrets Manager, etc.), or just `.env` files?  --we already have an env exmpale in teh backkedn folder---teh forntedn is teh one in marketplace while the backedn is in the backend folder..

**Minimum required env vars:**
```env
# Server
PORT=5000  ---3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/marketplace_dev  --check the env fle in teh backend folder

# JWT (must match User Dashboard's secret!)
JWT_SECRET=your_jwt_secret_here  --check the env file its there...


# CORS
CORS_ORIGIN=http://localhost:4321  --and 5173, and 5174 localhost
```

---

### **🔴 6. Category Seed Data**

You mentioned "all possible categories." Should I:
- [ ] Create a comprehensive list (50+ categories with subcategories)? yes comprehrensive list...
- [ ] Create a minimal set (10-15 top-level categories) and you'll add more later?
- [ ] Provide a JSON file you can edit and run a seed script?  --you can do this too i dont knwo may i nee dto add list bt once you have added these categories i shoudl be able to also edit and add more too them form teh backedn... since you are seeidng them they can still be eidted or added too...


**Examples of top-level categories:**
1. Electronics
2. Fashion
3. Vehicles
4. Real Estate
5. Home & Garden
6. Health & Beauty
7. Sports & Outdoors
8. Jobs
9. Services
10. Babies & Kids
11. Animals & Pets
12. Books & Media
13. Hobbies & Crafts
14. Agriculture
15. Industrial Equipment

**Should I create subcategories for each? (e.g., Electronics → Phones, Laptops, TVs, etc.)** ---yes just teh necessary subscetagories...

---

### **🔴 7. Product Status Workflow**

You mentioned admin approval for products. Clarify the states:

**Proposed flow:**
1. User creates product → `status = 'pending'`
2. Admin approves → `status = 'approved'` (now visible on marketplace)
3. Admin rejects → `status = 'rejected'` (user notified via email?)
4. Product expires? → `status = 'expired'` (after X days?)
5. Product sold? → `status = 'sold'` (user marks as sold?)

**Questions:**
- Should products auto-expire after X days? (e.g., 30 days from approval?)  --not really that one only is when we aretalking about product that pay for ads space on the websote etc--those ones have an expiry date... both for otehr ones... they dont really they can be there for as long as posisble....
- Can users mark their own products as "sold"? --yes
- Can users edit products after approval, or does editing reset to `pending`? --yes editing reset to pending..
- Can users delete their own products, or only admins? --they can...

---

### **🔴 8. Seller Payment Details - Security**

Payment details (bank account, account number) are sensitive. Should:
- [ - ] Only the product owner see their own payment details?
- [ - ] Buyers see payment details on product detail page? (as per original plan) --anyone can see this in the product detaisl page....
- [ ] Encrypt account numbers in the database?
- [ ] Log who views payment details (audit trail)?

**Current plan:** Buyers see payment details openly. Is this acceptable?

---

### **🔴 9. User Roles**

**Confirmed roles:**
- `user` (regular seller/buyer) --
- `admin` (approves products, promotions) --- the amdin here teh backend is in teh backend folder and forntend is in adminFrontend...


**Questions:**
- Is there a `super_admin` role? --we can have super admin.....
- Can users be promoted to admin via API, or only via direct DB update?  --- person person who doet have an acocunt can be invited to be an admin with special prvidleges... yes
- Should admins have full CRUD on all products, or just approve/reject? ---super admin can do anyting , admin can do what the super admin grnat them to be able to do but attleast can have fiull crud on prodct ..

---

### **🔴 10. API Response Format**

**Should all responses follow a standard format?**

**Option A: Standard Wrapper**
```json
{
  "success": true,
  "data": { /* actual data */ },
  "message": "Product created successfully"
}  --ye sbut check teh currnet format used in teh backend folder---taht si teh forat i wnat to follow and be consistent with sicne we will be pusting teh backedn in teh already done backend folder///
```

**Option B: Direct Data**
```json
{ /* actual data */ }
```

**Error format:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "title", "message": "Title is required" }
    ]
  }
}
```

**Recommendation:** Option A (standard wrapper) for consistency.

**Your preference?**

---

## **PROJECT STRUCTURE**

Based on [Express.js architecture best practices](https://dev.to/teguh_coding/stop-writing-spaghetti-api-routes-a-practical-guide-to-clean-expressjs-architecture-3ba7), here's the recommended structure:

```
marketplaceBackend/  ---the backedn is in the backend folder so you can check tehre and see hwo yu can integrate into that one backend too and make sure it is eeficent and can scale tooo 
├── src/
│   ├── config/
│   │   ├── database.js           # DB connection & pooling
│   │   ├── env.js                # Environment variables validation
│   │   └── constants.js          # App constants
│   │
│   ├── models/                   # Database models (IF Sequelize)
│   │   ├── index.js              # Model loader
│   │   ├── User.js
│   │   ├── Category.js
│   │   ├── Product.js
│   │   ├── ProductImage.js
│   │   └── SellerPaymentDetail.js
│   │
│   ├── prisma/                   # IF Prisma
│   │   ├── schema.prisma         # Database schema
│   │   └── migrations/           # Migration files
│   │
│   ├── controllers/              # Route handlers (business logic)
│   │   ├── authController.js
│   │   ├── categoryController.js
│   │   └── productController.js
│   │
│   ├── services/                 # Business logic layer (optional but recommended)
│   │   ├── categoryService.js
│   │   └── productService.js
│   │
│   ├── routes/                   # Route definitions
│   │   ├── index.js              # Route aggregator
│   │   ├── authRoutes.js
│   │   ├── categoryRoutes.js
│   │   └── productRoutes.js
│   │
│   ├── middleware/               # Custom middleware
│   │   ├── auth.js               # JWT verification
│   │   ├── errorHandler.js       # Global error handler
│   │   ├── notFound.js           # 404 handler
│   │   ├── validate.js           # Validation middleware
│   │   └── asyncHandler.js       # Async error wrapper
│   │
│   ├── validators/               # Input validation schemas
│   │   ├── categoryValidators.js
│   │   └── productValidators.js
│   │
│   ├── utils/                    # Utility functions
│   │   ├── logger.js             # Winston or Pino logger
│   │   ├── ApiError.js           # Custom error class
│   │   └── helpers.js            # Helper functions
│   │
│   ├── seeders/                  # Database seeders
│   │   ├── 01-categories.js
│   │   └── 02-locations.js
│   │
│   └── server.js                 # App entry point
│
├── tests/                        # Tests (Phase 7)
│   ├── unit/
│   └── integration/
│
├── .env.example                  # Environment template
├── .gitignore
├── package.json
├── README.md
└── .prettierrc                   # Code formatting
```

### **Why This Structure?**

**Separation of Concerns ([research](https://dev.to/moibra/best-practices-for-structuring-an-expressjs-project-148i)):**
- **Routes:** Define endpoints, attach validation, forward to controllers
- **Controllers:** Handle HTTP logic (req/res), call services
- **Services:** Contain business logic, interact with database
- **Middleware:** Cross-cutting concerns (auth, logging, errors)
- **Validators:** Declarative validation rules

**Benefits:**
- Easy to test (each layer independently)
- Easy to navigate (know where code lives)
- Scalable (add features without touching existing code)

---

## **DATABASE DESIGN DEEP DIVE**

### **PostgreSQL Connection Pool Configuration**

Based on [connection pooling research](https://grizzlypeaksoftware.com/library/connection-pooling-in-nodejs-postgresql-and-mongodb-pn3apzgq):

```javascript
// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
  // Connection pool settings
  max: 20,                    // Max connections (default: 10)
  min: 5,                     // Min idle connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Max time to wait for connection
  
  // Query timeout
  statement_timeout: 30000,   // Cancel queries after 30s
  
  // SSL for production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Database connected:', res.rows[0].now);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

module.exports = pool;
```

**Key consideration:** PostgreSQL default `max_connections` is 100. With multiple services, keep pool sizes modest to avoid exhaustion ([source](https://dev.to/polliog/your-nodejs-app-is-probably-killing-your-postgresql-connection-pooling-explained-1db2)).

---

### **Schema Design Decisions**

#### **1. Categories Table - Hierarchical Structure**

Based on [PostgreSQL hierarchical data research](https://thelinuxcode.com/how-to-run-hierarchical-queries-with-postgresql-practical-production-ready-guide/):

```sql
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

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
```

**🔴 EDGE CASE QUESTIONS:**

1. **Max depth:** Should there be a limit on category nesting? (e.g., max 3 levels: Electronics → Phones → Smartphones)  the max is 3
2. **Circular references:** Should we prevent categories from being their own ancestors? (needs validation) --yes
3. **Orphaned subcategories:** If parent deleted, should children:
   - [- ] Be deleted (CASCADE) ✅ Current behavior  --yes
   - [ ] Become top-level categories
   - [ ] Be prevented from deletion if has children

4. **Category reordering:** Should admins be able to change `display_order` via API? yes

**Querying all subcategories (Recursive CTE):**
```sql
WITH RECURSIVE category_tree AS (
  -- Anchor: start with a specific category

  SELECT id, name, parent_id, 1 AS level
  FROM categories
  WHERE id = $1
  UNION ALL
  
  -- Recursive: get all children
  SELECT c.id, c.name, c.parent_id, ct.level + 1
  FROM categories c
  INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;
```

---

#### **2. Products Table**

```sql
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
    country also VARCHAR NOT NULL,
    
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
```

**🔴 EDGE CASE QUESTIONS:**

1. **Price validation:**
   - Min price? (e.g., ₦100 minimum to prevent spam)
   - Max price? (e.g., ₦100,000,000 to prevent errors)
   - Free items? (price = 0) - should we allow?  --Do not Allow at least must be 1k naira

2. **Title/Description length:**
   - Min title length? (current: 10 chars in validation)
   - Max title length? (current: 255 chars)
   - Min description length? (current: 50 chars in validation)
   - Max description length? (prevent abuse)

3. **Location validation:**
   - Should we validate that state/city exist in our `states`/`cities` tables? --use this
   - Or allow free-form text? (more flexible but messy data)

4. **Product deletion:**
   - Hard delete (actually remove from DB)?
   - Soft delete (set `deleted_at` timestamp)? --soft delete
   - Archive instead? (move to `archived_products` table?)

5. **Duplicate detection:**
   - Should we check for duplicate titles from the same user?  --yes checek
   - Time-based: prevent posting same product twice within X hours? -- yes

6. **Concurrent edits:**
   - What if two admins approve/reject the same product simultaneously?  --use teh last updated one.. the last action sit on that..
   - Should we use optimistic locking (add `version` column)?

---

#### **3. Product Images Table**

```sql
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    display_order INTEGER DEFAULT 0 CHECK (display_order IN (0, 1, 2)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_images_product ON product_images(product_id);
```

**🔴 EDGE CASE QUESTIONS:**

1. **Image URL storage:**
   - Store full URL: `https://cdn.example.com/uploads/product1.jpg`
   - Store relative path: `/uploads/products/product1.jpg`
   - **Recommendation:** Relative path (easier to migrate storage)

2. **Enforce 3-image limit:**
   - Database constraint (CHECK)?
   - Application-level only?
   - **Current:** Application-level enforcement

3. **Image deletion timing:**
   - Delete from filesystem immediately when removed from DB?
   - Batch cleanup job?
   - Keep orphaned images for X days (recovery window)?

4. **Image reordering:**
   - Should users be able to change which image is first?
   - Does changing order update `updated_at` on product?

---

#### **4. Seller Payment Details Table**

```sql
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
```

**🔴 SECURITY & EDGE CASES:**

1. **Encryption:**
   - Should `account_number` be encrypted at rest?
   - If yes, which encryption method? (AES-256? pgcrypto?)
   - Key management strategy?

2. **Validation:**
   - Should we validate Nigerian bank account numbers? (10 digits, NUBAN format)
   - Verify account name matches bank API?
   - Or accept any text? (more flexible for international accounts)

3. **Update history:**
   - Should we keep history of payment detail changes?
   - Create `payment_details_history` table?
   - Log to `admin_logs`?

4. **Visibility:**
   - **Original plan:** Buyers see payment details on product page
   - **Alternative:** Payment details only shown after buyer expresses interest
   - **Most secure:** Payment details via escrow/intermediary only

**Which approach for visibility?**

---

### **Schema Creation Strategy**

**Option 1: Raw SQL Migration**
```sql
-- migrations/001_initial_schema.sql
-- Run with: psql -d marketplace_dev -f migrations/001_initial_schema.sql
```

**Option 2: Prisma Migrations**
```bash
npx prisma migrate dev --name initial_schema
```

**Option 3: Sequelize Migrations**
```bash
npx sequelize-cli migration:generate --name initial-schema
```

**🔴 QUESTION:** Which approach do you prefer?

---

## **API ARCHITECTURE & BEST PRACTICES**

### **RESTful Endpoint Design**

#### **Category Endpoints**

```
POST   /api/categories              - Create category (admin only)
GET    /api/categories              - Get all categories (tree structure)
GET    /api/categories/flat         - Get flat list of categories
GET    /api/categories/:id          - Get single category
PUT    /api/categories/:id          - Update category (admin only)
DELETE /api/categories/:id          - Delete category (admin only)
GET    /api/categories/:id/children - Get subcategories
```

**🔴 QUESTION:** Should there be a `/api/categories/:slug` endpoint to get by slug instead of ID?

---

#### **Product Endpoints**

```
POST   /api/products               - Create product (authenticated)
GET    /api/products               - Get all approved products (public)
GET    /api/products/:id           - Get single product detail (public)
PUT    /api/products/:id           - Update product (owner only)
DELETE /api/products/:id           - Delete product (owner/admin only)
PATCH  /api/products/:id/status    - Update status (admin only)
GET    /api/products/user/me       - Get current user's products
GET    /api/products/user/:id      - Get specific user's products (public)
```

**🔴 EDGE CASES:**

1. **GET /api/products behavior:**
   - Should it return ALL approved products (could be thousands)?
   - Or require pagination params? (e.g., `?page=1&limit=20`)
   - **Recommendation:** Require pagination always

2. **Product ownership transfer:**
   - Can ownership be transferred to another user?
   - What happens to payment details?

3. **Update permissions:**
   - Can users edit products after approval?
   - Does editing reset status to `pending`?

---

### **Middleware Stack**

Based on [Express middleware research](https://grizzlypeaksoftware.com/library/expressjs-middleware-architecture-deep-dive-p1qj1q08):

```javascript
// src/server.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// 1. Security headers (Helmet)
app.use(helmet());

// 2. CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

// 3. Request logging (Morgan)
app.use(morgan('combined'));

// 4. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Response compression
app.use(compression());

// 6. Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// 7. Routes
app.use('/api', require('./routes'));

// 8. 404 handler
app.use(require('./middleware/notFound'));

// 9. Error handler (MUST BE LAST)
app.use(require('./middleware/errorHandler'));

module.exports = app;
```

**🔴 QUESTION:** Are these rate limits appropriate?
- 100 requests per 15 minutes = ~6.6 requests/minute
- Too strict for legitimate users browsing products?
- Should authenticated users have higher limits?

---

## **AUTHENTICATION & AUTHORIZATION**

### **JWT Verification Middleware**

Based on [JWT best practices research](https://dev.to/mehrdadkurve/jwt-authentication-in-nodejs-a-complete-security-guide-with-express-40al):

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

/**
 * Verify JWT token from Authorization header
 * Sets req.user = { id, email, role }
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    
    // 2. Verify token signature
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], // Never trust alg from token!
      maxAge: '7d' // Additional expiry check
    });
    
    // 3. Validate payload structure
    if (!decoded.id || !decoded.email || !decoded.role) {
      throw new ApiError(401, 'Invalid token payload');
    }
    
    // 4. Set user on request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new ApiError(401, 'Invalid token'));
    }
    next(error);
  }
};

/**
 * Require admin role
 */
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ApiError(403, 'Admin access required'));
  }
  next();
};

/**
 * Check if user owns the resource
 * Usage: router.put('/:id', authenticate, isOwner(Product), controller.update)
 */
const isOwner = (Model) => {
  return async (req, res, next) => {
    try {
      const resource = await Model.findByPk(req.params.id);
      
      if (!resource) {
        return next(new ApiError(404, 'Resource not found'));
      }
      
      if (resource.user_id !== req.user.id && req.user.role !== 'admin') {
        return next(new ApiError(403, 'Access denied'));
      }
      
      req.resource = resource; // Attach to request
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { authenticate, isAdmin, isOwner };
```

**🔴 SECURITY QUESTIONS:**

1. **Token expiration:**
   - What expiry time for JWT? (current: 7 days)
   - Is there a refresh token mechanism?
   - Where does token refresh happen? (User Dashboard?)

2. **Token revocation:**
   - Can admins revoke tokens (ban users)?
   - If yes, need to check DB on every request (slower) or use Redis blacklist?

3. **Algorithm security:**
   - **Current:** HS256 (symmetric, shared secret)
   - **Alternative:** RS256 (asymmetric, public/private key pair)
   - RS256 better if User Dashboard and Marketplace are fully separate services

**Which algorithm is User Dashboard using?**

4. **CORS & Credentials:**
   - Should cookies be allowed? (`credentials: true`)
   - Or only `Authorization` header?

---

## **ERROR HANDLING STRATEGY**

Based on [Node.js error handling research](https://www.grizzlypeaksoftware.com/library/nodejs-error-handling-strategies-for-production-dqz7may0):

### **Custom Error Classes**

```javascript
// utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguish from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
```

### **Error Handler Middleware**

```javascript
// middleware/errorHandler.js
const ApiError = require('../utils/ApiError');

const errorHandler = (err, req, res, next) => {
  // Default to 500 if not an ApiError
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;
  
  // Log all errors
  console.error('Error:', {
    statusCode,
    message,
    details,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id
  });
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal Server Error';
    details = null;
  }
  
  // Send response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(details && { details })
    }
  });
};

module.exports = errorHandler;
```

### **Async Handler Wrapper**

**Problem:** Express 4.x doesn't catch async errors automatically.

**Solution ([research](https://dev.to/devanshu_patil/robust-error-handling-and-async-route-wrappers-in-expressjs-3k86)):**

```javascript
// middleware/asyncHandler.js
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
```

**Usage:**
```javascript
const asyncHandler = require('../middleware/asyncHandler');

router.get('/:id', asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) {
    throw new ApiError(404, 'Product not found');
  }
  res.json({ success: true, data: product });
}));
```

**🔴 QUESTION:** Should we upgrade to Express 5.x?
- Express 5 handles async errors natively (no wrapper needed)
- But still in beta (as of Oct 2026)
- **Recommendation:** Stay on Express 4.x, use `asyncHandler` wrapper

---

## **VALIDATION STRATEGY**

Based on [express-validator research](https://oneuptime.com/blog/post/2026-02-02-express-validator-input-validation/view):

### **Validation Middleware Pattern**

```javascript
// validators/productValidators.js
const { body, param, validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const createProductRules = [
  body('title')
    .trim()
    .isLength({ min: 10, max: 255 })
    .withMessage('Title must be between 10 and 255 characters'),
  
  body('description')
    .trim()
    .isLength({ min: 50, max: 5000 })
    .withMessage('Description must be between 50 and 5000 characters'),
  
  body('price')
    .isFloat({ min: 100, max: 100000000 })
    .withMessage('Price must be between ₦100 and ₦100,000,000'),
  
  body('condition')
    .isIn(['new', 'used', 'refurbished'])
    .withMessage('Condition must be new, used, or refurbished'),
  
  body('category_id')
    .isInt({ min: 1 })
    .withMessage('Valid category is required'),
  
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
];

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, 'Validation failed', errors.array());
  }
  next();
};

module.exports = {
  createProductRules,
  validateRequest
};
```

**Usage in route:**
```javascript
const { createProductRules, validateRequest } = require('../validators/productValidators');

router.post(
  '/products',
  authenticate,
  createProductRules,
  validateRequest,
  asyncHandler(productController.create)
);
```

**🔴 VALIDATION QUESTIONS:**

1. **Sanitization:**
   - Should we HTML-escape user input to prevent XSS?
   - Or trust frontend sanitization?
   - **Recommendation:** Always sanitize on backend

2. **Custom validators:**
   - Validate category exists in DB?
   - Validate state/city combination?
   - Check for duplicate titles?

3. **File size limits:**
   - Body parser limit: currently 10MB
   - Is this enough for future image uploads? (Phase 2)

---

## **IMPLEMENTATION CHECKLIST**

### **Day 1: Project Setup**
- [ ] Initialize Node.js project (`npm init`)
- [ ] Install dependencies
- [ ] Set up folder structure
- [ ] Configure environment variables (`.env`, `.env.example`)
- [ ] Set up ESLint + Prettier (code formatting)
- [ ] Initialize Git repo
- [ ] Create `.gitignore`

**ORM-specific:**
- [ ] IF Prisma: Initialize Prisma (`npx prisma init`)
- [ ] IF Sequelize: Set up Sequelize CLI

---

### **Day 2: Database & Models**
- [ ] Create PostgreSQL database
- [ ] Design complete schema (all tables)
- [ ] Create migration files
- [ ] Run migrations
- [ ] Set up database connection pool
- [ ] Test database connection
- [ ] Create seed files (categories, states, cities)
- [ ] Run seeders

---

### **Day 3: API Foundation**
- [ ] Set up Express server (`server.js`)
- [ ] Configure middleware stack (helmet, cors, etc.)
- [ ] Create error handling middleware
- [ ] Create async handler wrapper
- [ ] Create custom ApiError class
- [ ] Set up route structure (`routes/index.js`)
- [ ] Create authentication middleware (JWT verification)

---

### **Day 4: Category & Product APIs**

**Categories:**
- [ ] Create category controller
- [ ] Create category routes
- [ ] Create category validators
- [ ] Implement GET all categories (tree structure)
- [ ] Implement GET category by ID
- [ ] Implement POST create category (admin)
- [ ] Implement PUT update category (admin)
- [ ] Implement DELETE category (admin)
- [ ] Test all category endpoints

**Products:**
- [ ] Create product controller
- [ ] Create product routes
- [ ] Create product validators
- [ ] Implement POST create product
- [ ] Implement GET all products (with pagination)
- [ ] Implement GET product by ID
- [ ] Implement PUT update product (owner only)
- [ ] Implement DELETE product (owner/admin only)
- [ ] Test all product endpoints

---

## **TESTING STRATEGY**

### **Manual Testing (Phase 1)**

Use **Postman** or **Insomnia** to test:

1. **Category Endpoints:**
   - Create top-level category (admin)
   - Create subcategory (admin)
   - Get all categories (tree structure)
   - Get single category
   - Update category (admin)
   - Delete category (admin)
   - **Edge case:** Try to delete category with children

2. **Product Endpoints:**
   - Create product (authenticated user)
   - Get all products (pagination)
   - Get single product
   - Update product (owner)
   - Update product (non-owner) - should fail
   - Delete product (owner)
   - Delete product (non-owner) - should fail

3. **Authentication:**
   - Request without token - should fail
   - Request with invalid token - should fail
   - Request with expired token - should fail
   - Request with valid token - should succeed
   - Admin-only endpoint with user token - should fail

4. **Validation:**
   - Create product with missing fields - should fail
   - Create product with invalid price - should fail
   - Create product with invalid category - should fail
   - Create product with XSS payload - should sanitize

### **Postman Collection**

Should I create a Postman collection JSON file with all endpoints pre-configured?

---

## **EDGE CASES & CONSIDERATIONS**

### **1. Concurrency Issues**

**Scenario:** Two admins approve the same product simultaneously.

**Solution options:**
- [ ] Database-level constraint (PostgreSQL advisory locks)
- [ ] Optimistic locking (add `version` column)
- [ ] Accept race condition (last write wins)

**Which approach?**

---

### **2. Data Consistency**

**Scenario:** Product references a category that gets deleted.

**Current behavior:** `ON DELETE SET NULL` (category_id becomes NULL)

**Alternative:** `ON DELETE RESTRICT` (prevent deletion if products exist)

**Which is better?**

---

### **3. Soft Delete vs Hard Delete**

**Current:** Hard delete (actually remove from database)

**Alternative:** Soft delete (add `deleted_at` column)

**Benefits of soft delete:**
- Can recover accidentally deleted data
- Maintain referential integrity
- Audit trail

**Drawbacks:**
- Database grows indefinitely
- Need to filter `deleted_at IS NULL` in all queries
- Unique constraints become complex

**Should we implement soft delete?**

---

### **4. API Pagination Best Practices**

**Option 1: Offset-based (simple)**
```
GET /api/products?page=2&limit=20
```

**Option 2: Cursor-based (scalable)**
```
GET /api/products?cursor=eyJpZCI6MTAwfQ&limit=20
```

**Recommendation:** Start with offset-based (simpler), migrate to cursor-based if performance issues.

---

### **5. Rate Limiting Strategy**

**Different limits for different users:**
- Anonymous: 20 requests/15min
- Authenticated: 100 requests/15min
- Admin: 500 requests/15min

**Should we implement tiered rate limiting?**

---

### **6. CORS Configuration**

**Current:** Single origin from `CORS_ORIGIN` env var

**Production scenario:**
- User Dashboard: `https://dashboard.example.com`
- Marketplace Frontend: `https://marketplace.example.com`

**Should CORS allow multiple origins?**

```javascript
const allowedOrigins = [
  'https://dashboard.example.com',
  'https://marketplace.example.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

---

### **7. Database Backups**

**Question:** Should the backend code include a backup script?

**Options:**
- [ ] Automated daily backups via cron job
- [ ] Manual backup command (`npm run db:backup`)
- [ ] Rely on PostgreSQL server-level backups
- [ ] Use managed database service (automated backups)

---

### **8. Logging Strategy**

**Current:** `console.log()` and `morgan` for HTTP logs

**Production needs:**
- Structured logging (JSON format)
- Log levels (error, warn, info, debug)
- Log to file + stdout
- Log rotation (prevent disk fill)

**Should we use Winston or Pino?**

**Winston:**
- More features (transports, formats)
- Larger bundle size

**Pino:**
- Faster (4x-5x)
- Smaller
- Less features

**Recommendation:** Pino for performance, Winston for features.

---

### **9. Health Check Endpoint**

**Should we add a health check endpoint?**

```javascript
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

**Useful for:**
- Load balancer health checks
- Monitoring tools
- DevOps automation

---

### **10. API Documentation**

**Should we add Swagger/OpenAPI documentation?**

**Tools:**
- `swagger-jsdoc` + `swagger-ui-express`
- Auto-generated from JSDoc comments

**Example:**
```javascript
/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of products
 */
router.get('/products', controller.getAll);
```

**Benefit:** Interactive API docs at `/api-docs`

---

## **FINAL QUESTIONS SUMMARY**

Before I start implementation, please answer:

### **Critical Decisions:**
1. ✅ **ORM choice:** Prisma, Sequelize, or raw SQL? (Recommend Prisma with TypeScript)
2. ✅ **Language:** TypeScript or JavaScript? (Recommend TypeScript)
3. ✅ **Auth flow:** Confirm JWT structure and User Dashboard integration
4. ✅ **Database:** Confirm connection details and user setup
5. ✅ **API versioning:** `/api/v1/*` or `/api/*`?
6. ✅ **Response format:** Standard wrapper or direct data?
7. ✅ **Category depth:** Max nesting level for categories?
8. ✅ **Product expiry:** Auto-expire after X days?
9. ✅ **Payment details visibility:** Public or restricted?
10. ✅ **Rate limiting:** Appropriate limits for your use case?

### **Nice-to-Have:**
- Health check endpoint?
- Swagger documentation?
- Tiered rate limiting?
- Soft delete vs hard delete?
- Winston vs Pino for logging?

---

## **NEXT STEPS**

Once you answer the questions above, I will:

1. ✅ Create the exact folder structure
2. ✅ Write all configuration files (`.env.example`, database config)
3. ✅ Generate the complete database schema
4. ✅ Implement all controllers, routes, and middleware
5. ✅ Create seed files for categories and locations
6. ✅ Provide setup instructions
7. ✅ Create Postman collection for testing

**Let's make this bulletproof! 🚀**
