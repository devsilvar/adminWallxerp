# Quick Performance Fix Script for Landing Page (Windows PowerShell)

Write-Host "🚀 WallxTax Performance Optimization Script" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Sharp is installed
$sharpInstalled = npm list sharp-cli 2>$null
if (-not $sharpInstalled) {
    Write-Host "📦 Installing Sharp CLI for image optimization..." -ForegroundColor Yellow
    npm install -D sharp-cli
}

Write-Host "🖼️  Optimizing images to WebP format..." -ForegroundColor Cyan
Write-Host ""

# Navigate to images directory
Push-Location "public\images"

# Convert all JPG images to WebP
Get-ChildItem -Filter "*.jpg" | ForEach-Object {
    $outputFile = $_.BaseName + ".webp"
    Write-Host "  Converting $($_.Name) → $outputFile" -ForegroundColor Green
    npx sharp-cli -i $_.Name -o $outputFile --quality 80 --format webp
}

Pop-Location

Write-Host ""
Write-Host "✅ Image optimization complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Building application with bundle analyzer..." -ForegroundColor Cyan
npm run build

Write-Host ""
Write-Host "🎉 Done! Check dist\stats.html for bundle analysis" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update Landing.tsx to use .webp images"
Write-Host "2. Add loading='lazy' to below-fold images"
Write-Host "3. Test with: npm run preview"
Write-Host ""
Write-Host "Press any key to open bundle visualization..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
Start-Process "dist\stats.html"
