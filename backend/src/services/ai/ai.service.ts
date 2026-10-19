import Groq from 'groq-sdk';
import { config } from '@/config';
import logger from '@/lib/logger';
import prisma from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import {
  getSubscriptionStatus,
  checkAiQueryLimit,
  logAiQuery,
  getPlanLimits,
} from '@/services/subscription/subscription-guard.service';
import { buildBusinessFinancialContext, BusinessFinancialContext, FinancialScope } from './ai-context.service';
import { AIConfigService } from './ai-config.service';
import { UniversalAIClient, UniversalChatMessage } from './universal-ai.client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  reply: string;
  provider: string;
  model: string;
  contextSummary?: {
    totalSales: number;
    totalExpenses: number | null;
    grossProfit: number | null;
    profitMargin: number | null;
    taxPayable: number | null;
  };
}

interface CachedResponse {
  reply: string;
  provider: string;
  model: string;
  contextSummary?: any;
  cachedAt: number;
}

const responseCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function cacheKey(businessId: string, scope: FinancialScope, userMessage: string): string {
  // Scope is part of the key: two members asking the same question on the same
  // business get differently-redacted answers, so they must not share a cache entry.
  const scopeSig = `${Number(scope.sales)}${Number(scope.expenses)}${Number(scope.invoices)}${Number(scope.tax)}${Number(scope.reminders)}`;
  return `${businessId}:${scopeSig}:${userMessage.trim().toLowerCase()}`;
}

function getCachedResponse(businessId: string, scope: FinancialScope, userMessage: string): AIResponse | null {
  const key = cacheKey(businessId, scope, userMessage);
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return {
    reply: hit.reply,
    provider: hit.provider,
    model: hit.model,
    contextSummary: hit.contextSummary,
  };
}

function setCachedResponse(businessId: string, scope: FinancialScope, userMessage: string, response: AIResponse): AIResponse {
  const key = cacheKey(businessId, scope, userMessage);
  responseCache.set(key, {
    ...response,
    cachedAt: Date.now(),
  });

  if (responseCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of responseCache.entries()) {
      if (now - v.cachedAt > CACHE_TTL_MS) {
        responseCache.delete(k);
      }
    }
  }
  return response;
}

/**
 * Generates an executive-level business advisory response grounded in real business data.
 */
export async function generateAIResponse(
  businessId: string,
  userId: string,
  userMessage: string,
  history: ChatMessage[] = []
): Promise<AIResponse> {
  // Check user subscription status and monthly AI CFO query quota
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
      trialEndsAt: true,
      createdAt: true,
    },
  });

  const subStatus = user ? getSubscriptionStatus(user) : null;
  const enforcementEnabled = config.subscription?.enforcementEnabled ?? false;

  if (enforcementEnabled && subStatus && !subStatus.hasAccess) {
    throw new AppError(
      403,
      'Your trial or subscription has expired. Please upgrade to continue using the AI CFO.',
      'SUBSCRIPTION_EXPIRED',
      {
        tier: subStatus.tier,
        expiresAt: subStatus.expiresAt,
        subscriptionRequired: true,
      }
    );
  }

  const tier = subStatus?.tier ?? 'free';
  const aiLimit = await checkAiQueryLimit(userId, tier);
  if (enforcementEnabled && !aiLimit.allowed) {
    const limits = getPlanLimits(tier);
    throw new AppError(
      403,
      `You've reached your monthly AI query limit (${limits.maxMonthlyAiQueries}). Upgrade for more queries.`,
      'AI_QUERY_LIMIT_REACHED',
      { currentPlan: tier, maxQueries: limits.maxMonthlyAiQueries, currentQueries: aiLimit.current }
    );
  }

  const recordAndReturn = (response: AIResponse): AIResponse => {
    void logAiQuery(userId, businessId, userMessage, response.reply.length).catch((err) => {
      logger.warn('[AI Service] Failed to log AI query usage:', {
        error: err.message,
        userId,
        businessId,
      });
    });
    return response;
  };

  // 1. Gather verified financial data from database. Runs before the cache read
  // because the caller's permission scope is part of the cache key.
  const { context, summaryText } = await buildBusinessFinancialContext(businessId, userId);

  // Check short-term deduplication cache (for rapid repeat clicks or identical queries)
  if (history.length === 0) {
    const cached = getCachedResponse(businessId, context.scope, userMessage);
    if (cached) {
      return cached;
    }
  }

  // 2. Build system prompt
  const systemPrompt = `
You are the Senior SME Financial Advisor & Tax Intelligence Copilot for WallXERP by WallX, assisting Nigerian business owners.
Your mission is to help the business owner understand their financial health, diagnose operational bottlenecks, discover what can be improved, and ensure strict NRS tax compliance.

STRICT GROUNDING RULES:
1. Always base your answers on the verified business financial data provided below. Do not invent, guess, or contradict these numbers.
2. The Nigerian tax rate is strictly 7.5% of Gross Profit (Sales minus Deductible Expenses).
3. All financial amounts must be formatted in Nigerian Naira using the symbol ₦ with comma separators (e.g., ₦350,000).
4. Organize your responses using clean Markdown formatting:
   - Use bold for key numbers and metrics.
   - Use bullet points for readability.
   - Include 2-3 specific, realistic, and actionable recommendations.
5. If the business is experiencing an operating loss or low margin, be direct and constructive: pinpoint the exact driver (e.g. rising inventory costs, uncollected receivables).
6. Always maintain an encouraging, highly professional, executive tone.

=== VERIFIED LIVE BUSINESS FINANCIAL DATA ===
${summaryText}
`.trim();

  // 3. Attempt Active Configured Universal Provider (Admin-Configured or Cached)
  try {
    const activeConfig = await AIConfigService.getActiveConfig();
    if (activeConfig.isActive && activeConfig.apiKey) {
      const messages: UniversalChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      const completion = await UniversalAIClient.generateCompletion({
        baseUrl: activeConfig.baseUrl,
        apiKey: activeConfig.apiKey,
        model: activeConfig.model,
        messages,
        temperature: activeConfig.temperature,
        maxTokens: activeConfig.maxTokens,
      });

      if (completion.reply) {
        return recordAndReturn(
          setCachedResponse(businessId, context.scope, userMessage, {
            reply: completion.reply,
            provider: activeConfig.provider,
            model: activeConfig.model,
            contextSummary: extractContextSummary(context),
          })
        );
      }
    }
  } catch (err: any) {
    logger.warn('[AI Service] Active provider execution failed, attempting fallback:', {
      message: err.message,
    });
  }

  // 4. Secondary Fallback: Attempt Groq if distinct from failed provider
  if (config.ai.groqApiKey) {
    try {
      const groq = new Groq({ apiKey: config.ai.groqApiKey });
      const model = config.ai.model || 'qwen/qwen3.8-27b';

      const conversationTurns = history.slice(-6).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationTurns,
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      });

      const reply = completion.choices[0]?.message?.content;
      if (reply) {
        return recordAndReturn(
          setCachedResponse(businessId, context.scope, userMessage, {
            reply,
            provider: 'groq',
            model,
            contextSummary: extractContextSummary(context),
          })
        );
      }
    } catch (err: any) {
      logger.warn('[AI Service] Secondary Groq fallback failed:', {
        message: err.message,
      });
    }
  }

  // 5. Tertiary Fallback: Attempt Google Gemini
  if (config.ai.geminiApiKey) {
    try {
      const geminiModel = 'gemini-3.6-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${config.ai.geminiApiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            ...history.slice(-4).map((msg) => ({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }],
            })),
            {
              role: 'user',
              parts: [{ text: userMessage }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return recordAndReturn({
            reply: text,
            provider: 'gemini',
            model: geminiModel,
            contextSummary: extractContextSummary(context),
          });
        }
      }
    } catch (err: any) {
      logger.warn('[AI Service] Tertiary Gemini fallback failed:', { message: err.message });
    }
  }

  // 5. High-Quality Deterministic Local Rule-Based Mock Fallback
  // Ensures local development and test environments receive intelligent answers grounded in actual data
  logger.info('[AI Service] Serving deterministic business diagnostic fallback');
  const fallbackReply = generateDeterministicDiagnostic(userMessage, context);

  return recordAndReturn({
    reply: fallbackReply,
    provider: 'mock_fallback',
    model: 'paymytax-financial-rules-engine',
    contextSummary: extractContextSummary(context),
  });
}

function extractContextSummary(context: BusinessFinancialContext) {
  return {
    totalSales: context.currentMonth.totalSales,
    totalExpenses: context.currentMonth.totalExpenses,
    grossProfit: context.currentMonth.grossProfit,
    profitMargin: context.currentMonth.profitMarginPercent,
    taxPayable: context.currentMonth.taxPayable,
  };
}

/**
 * Generates an intelligent, grounded diagnostic response when external LLM API is unavailable.
 */
function generateDeterministicDiagnostic(
  query: string,
  ctx: BusinessFinancialContext
): string {
  const q = query.toLowerCase();

  // The full renderer below interpolates expenses, gross profit and tax figures
  // directly. Without both permissions those numbers are absent from the context
  // by design, so members outside that scope get a different answer entirely.
  if (!ctx.scope.expenses || !ctx.scope.tax) {
    return renderRestrictedDiagnostic(q, ctx);
  }

  const cm = ctx.currentMonth;
  const topExpense = ctx.topExpenseDrivers[0];
  // Nullable in the context — an owner can override `invoices.read` off for this role.
  const overdueAmount = ctx.invoicingHealth?.overdueAmount ?? 0;
  const overdueCount = ctx.invoicingHealth?.overdueInvoicesCount ?? 0;

  // Non-null by the guard above — the context only nulls these when the
  // corresponding permission is absent.
  const totalExpenses = cm.totalExpenses ?? 0;
  const grossProfit = cm.grossProfit ?? 0;
  const profitMarginPercent = cm.profitMarginPercent ?? 0;
  const taxPayable = cm.taxPayable ?? 0;

  // Intent: Tax & Deadlines
  if (q.includes('tax') || q.includes('firs') || q.includes('deadline') || q.includes('due')) {
    return `### 🏛️ Tax Compliance & Obligation Summary for **${ctx.business.name}**

Here is your NRS tax status for **${cm.periodName}**:
- **Gross Profit:** ₦${grossProfit.toLocaleString()} (Sales ₦${cm.totalSales.toLocaleString()} − Deductible Expenses ₦${totalExpenses.toLocaleString()})
- **Tax Rate:** **${cm.taxRatePercent}%** (NRS Gross Profit Standard)
- **Estimated Tax Payable:** **₦${taxPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**
- **Filing Status:** ${cm.isFinalized ? '✅ **Finalized**' : '📝 **Draft / Live Calculation**'}
- **Payment Status:** ${cm.paymentStatus === 'completed' ? '🟢 **Paid**' : '⏳ **Pending Remittance**'}

#### 💡 Compliance Guidelines:
1. **NRS Remittance Deadline:** Monthly returns must be filed and remitted on or before the **21st of the following month**.
2. **Deductions:** Keep receipts for all deductible business expenses to defend your gross profit calculations during audit checks.
3. ${taxPayable > 0 ? 'You can finalize this month’s report and pay directly via Paystack from your **Tax Reports** dashboard.' : 'No tax is payable when operating at a loss.'}`;
  }

  // Intent: What is going wrong / Problems
  if (q.includes('wrong') || q.includes('problem') || q.includes('issue') || q.includes('loss') || q.includes('bad')) {
    const issues: string[] = [];
    if (cm.isOperatingLoss) {
      issues.push(`⚠️ **Operating at a Loss:** Your expenses (**₦${totalExpenses.toLocaleString()}**) currently exceed your sales (**₦${cm.totalSales.toLocaleString()}**), resulting in a net deficit of **-₦${Math.abs(grossProfit).toLocaleString()}**.`);
    } else if (profitMarginPercent < ctx.business.targetProfitMarginPercent) {
      issues.push(`⚠️ **Margin Erosion:** Your current margin (**${profitMarginPercent}%**) is under your target of **${ctx.business.targetProfitMarginPercent}%**.`);
    }

    if (overdueAmount > 0) {
      issues.push(`⚠️ **Trapped Cashflow:** You have **₦${overdueAmount.toLocaleString()}** tied up across **${overdueCount} overdue invoice(s)** that have not been collected.`);
    }

    if (topExpense && topExpense.sharePercent > 50) {
      issues.push(`⚠️ **Concentrated Expense Risk:** **${topExpense.category}** represents **${topExpense.sharePercent}%** of your total spending (₦${topExpense.amount.toLocaleString()}).`);
    }

    if (issues.length === 0) {
      return `### 📊 Health Check for **${ctx.business.name}**

Good news! Your core financial metrics are looking solid for **${cm.periodName}**:
- **Profit Margin:** **${profitMarginPercent}%** (Target: ${ctx.business.targetProfitMarginPercent}%)
- **Gross Profit:** **₦${grossProfit.toLocaleString()}**
- **Overdue Invoices:** ₦0.00 (All customer receivables are up to date)

#### 💡 Areas to Watch:
- Continuously monitor your top expense category: **${topExpense ? topExpense.category : 'General Operations'}**.
- Prepare your tax remittance of **₦${taxPayable.toLocaleString()}** before the 21st.`;
    }

    return `### 🔍 Critical Diagnostic Findings for **${ctx.business.name}**

Here are the key bottlenecks currently impacting your business:

${issues.join('\n\n')}

#### 💡 Immediate Corrective Actions:
1. ${overdueAmount > 0 ? `**Send payment reminders** to clients with overdue balances to recover **₦${overdueAmount.toLocaleString()}** immediately.` : '**Focus on increasing high-margin sales volume.**'}
2. **Review spending** in **${topExpense?.category || 'your main expense areas'}** to renegotiate terms or eliminate recurring leakages.
3. Keep logging daily expenses to maintain an accurate view of operational cash flow.`;
  }

  // Intent: What to improve / Cost cutting / Growth
  if (q.includes('improve') || q.includes('increase') || q.includes('grow') || q.includes('better') || q.includes('cut')) {
    return `### 💡 Strategic Improvement Plan for **${ctx.business.name}**

Based on your actual performance figures for **${cm.periodName}**, here is where you have the highest leverage:

1. **Recover Overdue Invoices:**
   - You have **₦${overdueAmount.toLocaleString()}** in overdue client invoices. Following up today will immediately improve your cash position without incurring any loans.
2. **Optimize ${topExpense ? topExpense.category : 'Major Costs'}:**
   - ${topExpense ? `Your largest expense is **${topExpense.category}** at **₦${topExpense.amount.toLocaleString()}** (${topExpense.sharePercent}% of total expenses). Negotiating bulk supplier discounts or payment terms can save 5–10% straight to your gross profit.` : 'Record all operating costs to accurately see your cost drivers.'}
3. **Protect Your Profit Margin:**
   - Your current margin is **${profitMarginPercent}%** (Target: **${ctx.business.targetProfitMarginPercent}%**). Focus marketing on your highest-margin products or service packages.
4. **Automate Sales Capture:**
   - Use your Dedicated Virtual Account (DVA) for customer bank transfers to ensure zero sales are missed.`;
  }

  // Intent: Biggest expenses / spending breakdown
  if (q.includes('expense') || q.includes('spending') || q.includes('cost') || q.includes('spend')) {
    const drivers = ctx.topExpenseDrivers;
    return `### 💸 Expense Breakdown for **${ctx.business.name}** (${cm.periodName})

Total Deductible Spending: **₦${totalExpenses.toLocaleString()}**

${drivers.length > 0 ? drivers.map((d, i) => `${i + 1}. **${d.category}:** ₦${d.amount.toLocaleString()} (${d.sharePercent}% of total spending)`).join('\n') : '• No expenses recorded this month yet.'}

#### 💡 Cost Management Advice:
- **Tax Deductibility:** Ensure all expenses logged are wholly, exclusively, and necessarily incurred for business operations to qualify for NRS gross profit deductions.
- **Top Driver:** Focus your cost-cutting efforts on **${drivers[0]?.category || 'primary operations'}**, which carries the largest financial weight.`;
  }

  // Default: General Overview & Health Snapshot
  return `### 📊 Executive Financial Overview: **${ctx.business.name}** (${cm.periodName})

Here is how your business is performing this month:
- **Total Sales Revenue:** **₦${cm.totalSales.toLocaleString()}**
- **Deductible Expenses:** **₦${totalExpenses.toLocaleString()}**
- **Gross Profit:** **₦${grossProfit.toLocaleString()}**
- **Profit Margin:** **${profitMarginPercent}%** ${profitMarginPercent >= ctx.business.targetProfitMarginPercent ? '🟢 (Healthy)' : '⚠️ (Below Target)'}
- **Estimated Tax (7.5%):** **₦${taxPayable.toLocaleString()}**

#### 🔍 Health Assessment:
- ${grossProfit > 0 ? `Your business is generating positive gross profit of **₦${grossProfit.toLocaleString()}**.` : 'Your business is currently operating at a deficit this month.'}
- ${overdueAmount > 0 ? `You have **₦${overdueAmount.toLocaleString()}** in overdue client invoices requiring collection.` : 'Your invoice collections are up to date.'}

Ask me anything specific, such as *"What is going wrong?"*, *"Where am I spending the most money?"*, or *"What can I improve?"*`;
}

/**
 * Fallback renderer for members whose role cannot see expense or tax figures —
 * `sales_staff` holds `ai.use` by default but not `expenses.read` / `tax.read`.
 * Answers from the domains they can see and declines the rest outright, rather
 * than rendering a half-empty financial picture.
 */
function renderRestrictedDiagnostic(q: string, ctx: BusinessFinancialContext): string {
  const cm = ctx.currentMonth;
  const health = ctx.invoicingHealth;
  const naira = (v: number) => `₦${v.toLocaleString()}`;

  const wantsMoneyDetail =
    q.includes('expense') || q.includes('spending') || q.includes('spend') ||
    q.includes('cost') || q.includes('profit') || q.includes('margin') ||
    q.includes('tax') || q.includes('firs');

  if (wantsMoneyDetail) {
    const available: string[] = [];
    if (ctx.scope.sales) available.push('sales performance');
    if (ctx.scope.invoices) available.push('invoice receivables');
    if (ctx.scope.reminders) available.push('active reminders');

    return `### 🔒 Access Restricted — **${ctx.business.name}**

Expense, margin and tax figures sit outside your role's permissions, so I can't answer that without inventing numbers.

**What I can help with for ${cm.periodName}:**
${available.length > 0 ? available.map((a) => `- ${a}`).join('\n') : '- nothing — your role grants no financial visibility right now'}

Ask an owner or manager to grant the relevant permission if you need this figure.`;
  }

  const wantsReceivables =
    q.includes('invoice') || q.includes('receivable') || q.includes('overdue') ||
    q.includes('owed') || q.includes('collect') || q.includes('cash');

  if (wantsReceivables && ctx.scope.invoices && health) {
    if (health.overdueAmount > 0) {
      return `### 💰 Receivables Snapshot for **${ctx.business.name}** (${cm.periodName})

- **Overdue:** ${naira(health.overdueAmount)} across ${health.overdueInvoicesCount} invoice(s) past their due date
- **Sent, Not Yet Due:** ${naira(health.unpaidSentAmount)} across ${health.unpaidSentCount} invoice(s)

Following up on the overdue balance is the fastest available lever on cash position this month.`;
    }

    return `### 💰 Receivables Snapshot for **${ctx.business.name}** (${cm.periodName})

- **Overdue:** ${naira(0)} — nothing is past its due date
- **Sent, Not Yet Due:** ${naira(health.unpaidSentAmount)} across ${health.unpaidSentCount} invoice(s)

Collections are on track. Keep DVA capture active so incoming transfers post as sales automatically.`;
  }

  if (ctx.scope.sales) {
    return `### 📊 Sales Snapshot for **${ctx.business.name}** (${cm.periodName})

- **Total Sales Revenue:** **${naira(cm.totalSales)}**
${
  ctx.scope.invoices && health
    ? health.overdueAmount > 0
      ? `- **Overdue Receivables:** ${naira(health.overdueAmount)} across ${health.overdueInvoicesCount} invoice(s)`
      : `- **Receivables:** ${naira(health.unpaidSentAmount)} sent and within terms`
    : ''
}

Expense, margin and tax figures sit outside your role's permissions, so this snapshot covers revenue and collections only.`;
  }

  return `### 🔒 Limited Access — **${ctx.business.name}**

Your role does not grant access to sales, expense, invoice or tax figures, so I have no verified data to work from. Ask an owner or manager to grant the relevant permission.`;
}
