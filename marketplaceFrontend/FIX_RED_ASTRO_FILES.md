# FIX: Red Astro Files in VS Code

## Why Are .astro Files Showing Red?

This happens when VS Code's Astro language server isn't properly initialized. Common causes:

1. ❌ Missing Astro extension
2. ❌ Astro types not generated
3. ❌ TypeScript language server not started
4. ❌ Workspace trust issues

---

## ✅ Quick Fix (Do These Steps)

### Step 1: Install Astro Extension

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions)
3. Search for "**Astro**"
4. Install: **Astro** by Astro Technology Company
5. **Reload VS Code** (`Ctrl+Shift+P` → "Reload Window")

### Step 2: Generate Astro Types

```bash
cd marketplaceFrontend
npm run dev
```

This generates `.astro/types.d.ts` which VS Code needs.

**Wait 5-10 seconds** after starting the dev server, then:
- Press `Ctrl+C` to stop
- **Reload VS Code** (`Ctrl+Shift+P` → "Developer: Reload Window")

### Step 3: Restart TypeScript Server

In VS Code:
1. Open any `.astro` file
2. Press `Ctrl+Shift+P`
3. Type: "**TypeScript: Restart TS Server**"
4. Press Enter

### Step 4: Trust Workspace (If Prompted)

If you see a workspace trust prompt:
- Click "**Yes, I trust the authors**"

---

## 🔍 Verify It's Fixed

After completing the steps above:

1. Open `src/pages/index.astro`
2. The file should now show **normal colors** (not red)
3. You should see **IntelliSense** working (hover over components)
4. No red squiggly lines under `<Layout>` or other components

---

## 🛠️ Alternative: Manual Fix

If the quick fix doesn't work:

### A. Check .astro Folder Exists

```bash
dir .astro
```

If it doesn't exist:
```bash
npm run dev
# Wait 5 seconds, then Ctrl+C
```

### B. Check VS Code Extensions

Required extensions:
- ✅ **Astro** (astro-build.astro-vscode)
- ✅ **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- ✅ **ESLint** (dbaeumer.vscode-eslint)

### C. Clear VS Code Cache

Close VS Code, then:
```bash
# Delete VS Code cache
rmdir /s "%APPDATA%\Code\Cache"
rmdir /s "%APPDATA%\Code\CachedData"
```

Restart VS Code.

---

## 🚨 Still Not Working?

### Check 1: Node Version
```bash
node --version
# Should be: v22.22.3 or higher
```

### Check 2: TypeScript Version
```bash
npx tsc --version
# Should be: Version 5.7.2
```

### Check 3: Astro Dev Server Logs

```bash
npm run dev
# Look for errors in the output
```

Common errors:
- "Cannot find module" → Run `npm install`
- "Port already in use" → Change port in package.json
- TypeScript errors → Run `npm run typecheck`

---

## 📋 Full Reset (Nuclear Option)

If nothing works:

```bash
# 1. Close VS Code completely

# 2. Delete generated files
rmdir /s /q node_modules
rmdir /s /q .astro
del package-lock.json

# 3. Reinstall
npm install

# 4. Generate types
npm run dev
# Wait 10 seconds, then Ctrl+C

# 5. Reopen VS Code
code .

# 6. Restart TS Server
# Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

---

## ✅ Expected Result

After fixing, you should see:

- ✅ `.astro` files with **normal syntax highlighting** (blue, yellow, white)
- ✅ **IntelliSense** working (autocomplete for components)
- ✅ **No red underlines** on imports or components
- ✅ **Go to Definition** working (`F12` on components)
- ✅ **Hover tooltips** showing type information

---

## 🎯 Quick Reference

| Issue | Solution |
|-------|----------|
| Red .astro files | Install Astro extension + restart |
| No autocomplete | Generate types: `npm run dev` |
| TypeScript errors | Restart TS Server (Ctrl+Shift+P) |
| Still broken | Full reset (see above) |

---

## 💡 Pro Tips

1. **Always run `npm run dev` once** after cloning/installing
2. **Reload VS Code** after installing extensions
3. **Keep Astro extension updated** (check for updates)
4. **Trust the workspace** when prompted

---

**Most Common Fix**: Install Astro extension → Run `npm run dev` → Reload VS Code

That should fix 90% of red file issues! 🚀
