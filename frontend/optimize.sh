#!/bin/bash
# Quick Performance Fix Script for Landing Page

echo "🚀 WallxTax Performance Optimization Script"
echo "==========================================="
echo ""

# Check if Sharp is installed
if ! npm list sharp-cli &> /dev/null; then
    echo "📦 Installing Sharp CLI for image optimization..."
    npm install -D sharp-cli
fi

echo "🖼️  Optimizing images to WebP format..."
echo ""

# Navigate to images directory
cd public/images

# Convert all JPG images to WebP
for file in *.jpg; do
    if [ -f "$file" ]; then
        output="${file%.jpg}.webp"
        echo "  Converting $file → $output"
        npx sharp-cli -i "$file" -o "$output" --quality 80 --format webp
    fi
done

cd ../..

echo ""
echo "✅ Image optimization complete!"
echo ""
echo "📊 Building application with bundle analyzer..."
npm run build

echo ""
echo "🎉 Done! Check dist/stats.html for bundle analysis"
echo ""
echo "Next steps:"
echo "1. Update Landing.tsx to use .webp images"
echo "2. Add loading='lazy' to below-fold images"
echo "3. Test with: npm run preview"
