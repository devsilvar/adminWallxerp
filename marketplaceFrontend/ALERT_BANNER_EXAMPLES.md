# Alert Banner - Usage Examples

## Modern, Sharp & Clean Alert Banners 🎨

I've created a flexible `AlertBanner` component with **4 variants** and **6 types** of alerts. Here's how to use them:

---

## **Installation**

The component uses `lucide-react` icons (already in your project) and your existing UI components.

---

## **Basic Usage**

```tsx
import AlertBanner from '@/components/AlertBanner';

<AlertBanner
  type="tax"
  variant="gradient"
  title="Action Recommended: Complete Your NTA 2025 Tax Assessment"
  description="Nigeria Tax Act 2025 exempts companies under ₦100M from CIT and businesses under ₦25M from VAT. Answer 10 quick questions to ensure your monthly tax calculations apply the correct statutory rates."
  actionText="Start Assessment"
  actionUrl="/assessment"
  dismissible={true}
/>
```

---

## **4 Visual Variants**

### **1. Default (Clean & Professional)** ✨ RECOMMENDED
```tsx
<AlertBanner
  type="tax"
  variant="default"
  title="Complete Your NTA 2025 Tax Assessment"
  description="Ensure compliance with new tax exemptions. Answer 10 questions to verify your CIT/VAT status."
  actionText="Start Now"
  actionUrl="/assessment"
/>
```

**Best for:** Dashboard alerts, important notices
**Design:** Clean borders, subtle background, organized layout

---

### **2. Gradient (Modern & Eye-catching)** 🌈
```tsx
<AlertBanner
  type="action"
  variant="gradient"
  title="🎯 Tax Relief Available!"
  description="Companies under ₦100M qualify for 0% CIT. Complete your assessment to claim benefits."
  actionText="Check Eligibility"
  actionUrl="/assessment"
/>
```

**Best for:** Promotions, urgent actions, feature announcements
**Design:** Gradient background, white text, glowing icon

---

### **3. Minimal (Clean & Subtle)** 🪶
```tsx
<AlertBanner
  type="info"
  variant="minimal"
  title="Tax Assessment Required"
  description="Update your 2025 tax profile to ensure accurate calculations"
  actionText="Update Profile"
  actionUrl="/profile/tax"
/>
```

**Best for:** Non-intrusive notifications, secondary information
**Design:** Single line, minimal spacing, subtle colors

---

### **4. Bold (Strong & Attention-grabbing)** 💪
```tsx
<AlertBanner
  type="warning"
  variant="bold"
  title="⚡ Deadline Approaching!"
  description="Complete your NTA 2025 assessment before March 31st to avoid penalties."
  actionText="Complete Now"
  actionUrl="/assessment"
/>
```

**Best for:** Critical alerts, deadlines, important actions
**Design:** Large icon, bold typography, strong colors

---

## **6 Alert Types**

### **Type: `tax`** (Purple) - Tax-related notifications
```tsx
<AlertBanner
  type="tax"
  variant="default"
  title="Tax Assessment Reminder"
  description="Your tax profile needs updating"
  actionText="Update"
  actionUrl="/tax"
/>
```
**Icon:** ShieldCheck ✅

---

### **Type: `action`** (Indigo) - Call-to-action alerts
```tsx
<AlertBanner
  type="action"
  variant="gradient"
  title="Take Action Now"
  description="Complete your setup to start using all features"
  actionText="Complete Setup"
  actionUrl="/setup"
/>
```
**Icon:** Zap ⚡

---

### **Type: `info`** (Blue) - Informational messages
```tsx
<AlertBanner
  type="info"
  variant="minimal"
  title="System Maintenance Scheduled"
  description="Brief downtime on Sunday, 2 AM - 4 AM"
  dismissible={true}
/>
```
**Icon:** Info ℹ️

---

### **Type: `success`** (Green) - Success messages
```tsx
<AlertBanner
  type="success"
  variant="default"
  title="Assessment Complete!"
  description="You qualify for 0% CIT relief under NTA 2025"
  actionText="View Report"
  actionUrl="/report"
/>
```
**Icon:** CheckCircle2 ✓

---

### **Type: `warning`** (Amber) - Warning messages
```tsx
<AlertBanner
  type="warning"
  variant="bold"
  title="Compliance Issue Detected"
  description="Your VAT registration requires verification"
  actionText="Verify Now"
  actionUrl="/verify"
/>
```
**Icon:** AlertCircle ⚠️

---

### **Type: `error`** (Red) - Error messages
```tsx
<AlertBanner
  type="error"
  variant="default"
  title="Payment Failed"
  description="Your subscription payment could not be processed"
  actionText="Retry Payment"
  actionUrl="/billing"
/>
```
**Icon:** XCircle ❌

---

## **Props Reference**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `'info' \| 'success' \| 'warning' \| 'error' \| 'tax' \| 'action'` | `'info'` | Alert color scheme and icon |
| `variant` | `'default' \| 'gradient' \| 'minimal' \| 'bold'` | `'default'` | Visual style |
| `title` | `string` | required | Alert heading |
| `description` | `string` | required | Alert message |
| `actionText` | `string` | optional | Button/link text |
| `actionUrl` | `string` | optional | Button/link destination |
| `onClose` | `() => void` | optional | Called when alert is dismissed |
| `dismissible` | `boolean` | `true` | Show close button |

---

## **Integration Examples**

### **Example 1: Top of Dashboard**
```tsx
// src/pages/dashboard.astro
---
import Layout from '@/layouts/Layout.astro';
import AlertBanner from '@/components/AlertBanner';
---

<Layout title="Dashboard">
  <AlertBanner
    type="tax"
    variant="gradient"
    title="Action Recommended: Complete Your NTA 2025 Tax Assessment"
    description="0% CIT / VAT Relief: Nigeria Tax Act 2025 exempts companies under ₦100M from CIT and businesses under ₦25M from VAT."
    actionText="Start Assessment"
    actionUrl="/tax-assessment"
    client:load
  />
  
  <!-- Rest of dashboard content -->
</Layout>
```

---

### **Example 2: Multiple Alerts (Stacked)**
```tsx
<>
  <AlertBanner
    type="warning"
    variant="bold"
    title="Deadline: March 31st"
    description="Complete your NTA 2025 assessment to avoid penalties"
    actionText="Complete Now"
    actionUrl="/assessment"
    client:load
  />
  
  <AlertBanner
    type="info"
    variant="minimal"
    title="New Feature"
    description="Tax calculator now supports NTA 2025 rates"
    dismissible={true}
    client:load
  />
</>
```

---

### **Example 3: Conditional Alert (Show only if not completed)**
```tsx
{!user.hasCompletedTaxAssessment && (
  <AlertBanner
    type="action"
    variant="gradient"
    title="⚡ Quick Action Required"
    description="Complete your 2025 tax assessment (takes 5 minutes)"
    actionText="Start Now"
    actionUrl="/assessment"
    client:load
  />
)}
```

---

### **Example 4: Dismissible with Callback**
```tsx
<AlertBanner
  type="info"
  variant="default"
  title="Announcement"
  description="We've updated our tax calculation engine"
  dismissible={true}
  onClose={() => {
    console.log('Alert dismissed');
    localStorage.setItem('alert_dismissed', 'true');
  }}
  client:load
/>
```

---

## **My Recommendations for Your Tax Alert**

### **Option A: Gradient (Most Eye-catching)** 🌟
```tsx
<AlertBanner
  type="tax"
  variant="gradient"
  title="🎯 NTA 2025 Tax Assessment Required"
  description="Companies under ₦100M qualify for 0% CIT. Businesses under ₦25M exempt from VAT. Complete your 10-question assessment now."
  actionText="Start Assessment"
  actionUrl="/assessment"
  dismissible={true}
  client:load
/>
```

---

### **Option B: Bold (Strong & Professional)** 💼
```tsx
<AlertBanner
  type="action"
  variant="bold"
  title="Action Recommended: Complete Your NTA 2025 Tax Assessment"
  description="Nigeria Tax Act 2025 exempts companies under ₦100M from CIT and businesses under ₦25M from VAT. Answer 10 quick questions to ensure your monthly tax calculations apply the correct statutory rates."
  actionText="Start Now"
  actionUrl="/assessment"
  client:load
/>
```

---

### **Option C: Default (Clean & Trustworthy)** ✨
```tsx
<AlertBanner
  type="tax"
  variant="default"
  title="Complete Your NTA 2025 Tax Assessment"
  description="Ensure accurate tax calculations with the new Nigeria Tax Act 2025 rates. Companies under ₦100M: 0% CIT. Businesses under ₦25M: 0% VAT."
  actionText="Start Assessment"
  actionUrl="/assessment"
  client:load
/>
```

---

## **Icons Used (Sharp & Modern)**

All icons from `lucide-react`:

- **ShieldCheck** - Tax/Security alerts ✅
- **Zap** - Action/Urgent alerts ⚡
- **Info** - Informational ℹ️
- **CheckCircle2** - Success ✓
- **AlertCircle** - Warning ⚠️
- **XCircle** - Error ❌
- **Sparkles** - Special/Featured ✨
- **ArrowRight** - Call-to-action →
- **X** - Close button ✕

All icons are sharp, clean, and modern - much better than the default warning icons!

---

## **Responsive Design**

The component is fully responsive:
- **Mobile**: Stacks vertically, smaller text
- **Tablet**: Optimized spacing
- **Desktop**: Full horizontal layout

---

## **Dark Mode Support**

All variants support dark mode automatically using Tailwind's dark mode utilities.

---

## **Which variant should you use?**

- **Need maximum attention?** → Use `gradient` or `bold`
- **Want professional & clean?** → Use `default`
- **Prefer subtle notification?** → Use `minimal`

For your tax assessment, I recommend **`gradient`** (most modern) or **`bold`** (most professional).

Let me know which you prefer! 🚀
