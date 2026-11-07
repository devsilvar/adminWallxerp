#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const ASSETS_DIR = path.join(__dirname, '../src/assets');

// Define responsive breakpoints and quality
const SIZES = {
  sm: 640,
  md: 768,
  lg: 1024,
};

const QUALITY = 82; // Good balance between size and quality

/**
 * Convert and resize a single image to WebP format
 */
async function optimizeImage(inputPath, outputDir, filename, sizes = null) {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  console.log(`Processing: ${filename}`);

  if (sizes) {
    // Create responsive variants
    for (const [sizeName, width] of Object.entries(sizes)) {
      const outputPath = path.join(outputDir, `${name}-${sizeName}.webp`);
      await sharp(inputPath)
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(outputPath);
      console.log(`  ✓ Created ${name}-${sizeName}.webp (${width}px)`);
    }
  } else {
    // Single optimized version
    const outputPath = path.join(outputDir, `${name}.webp`);
    await sharp(inputPath)
      .webp({ quality: QUALITY })
      .toFile(outputPath);
    console.log(`  ✓ Created ${name}.webp`);
  }
}

/**
 * Optimize logo specifically (needs transparency)
 */
async function optimizeLogo(inputPath, outputDir) {
  console.log('Processing: logo.png');
  
  // Multiple sizes for different contexts
  const logoSizes = [48, 64, 96, 128]; // sm, md, lg, xl
  
  for (const size of logoSizes) {
    const outputPath = path.join(outputDir, `logo-${size}.webp`);
    await sharp(inputPath)
      .resize(size, null, { withoutEnlargement: true })
      .webp({ quality: 90, lossless: false })
      .toFile(outputPath);
    console.log(`  ✓ Created logo-${size}.webp (${size}px)`);
  }
}

/**
 * Optimize small profile images
 */
async function optimizeProfileImage(inputPath, outputDir, filename) {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  console.log(`Processing: ${filename}`);
  
  // Profile images are tiny, create 2 sizes
  const sizes = { sm: 32, md: 48 }; // 1x and 1.5x for retina
  
  for (const [sizeName, size] of Object.entries(sizes)) {
    const outputPath = path.join(outputDir, `${name}-${sizeName}.webp`);
    await sharp(inputPath)
      .resize(size, size, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(outputPath);
    console.log(`  ✓ Created ${name}-${sizeName}.webp (${size}x${size}px)`);
  }
}

async function main() {
  console.log('🖼️  Image Optimization Starting...\n');

  // Create output directory
  const optimizedDir = path.join(PUBLIC_DIR, 'images-optimized');
  if (!fs.existsSync(optimizedDir)) {
    fs.mkdirSync(optimizedDir, { recursive: true });
  }

  // 1. Optimize hero/feature images (large, need responsive)
  const heroImages = [
    'team-efficiency.jpg',
    'mobile-interface.jpg',
    'dashboard-hero.jpg',
    'compliance-secure.jpg',
    'business-growth.jpg',
    'workspace.jpg',
  ];

  console.log('📦 Optimizing hero/feature images...\n');
  for (const img of heroImages) {
    const inputPath = path.join(PUBLIC_DIR, 'images', img);
    if (fs.existsSync(inputPath)) {
      await optimizeImage(inputPath, optimizedDir, img, SIZES);
    }
  }

  // 2. Optimize logo
  console.log('\n🎨 Optimizing logo...\n');
  const logoPath = path.join(PUBLIC_DIR, 'logo.png');
  if (fs.existsSync(logoPath)) {
    await optimizeLogo(logoPath, optimizedDir);
  }

  // 3. Optimize profile images
  console.log('\n👤 Optimizing profile images...\n');
  const profileImages = ['nigerian1.jfif', 'nigerian2.jpg', 'nigerian3.jfif', 'nigerian4.jfif'];
  
  for (const img of profileImages) {
    const inputPath = path.join(ASSETS_DIR, img);
    if (fs.existsSync(inputPath)) {
      await optimizeProfileImage(inputPath, optimizedDir, img);
    }
  }

  console.log('\n✅ Image optimization complete!');
  console.log(`📁 Optimized images saved to: ${optimizedDir}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Update image references in your components');
  console.log('   2. Use <picture> elements with srcset for responsive images');
  console.log('   3. Keep original images as fallback for older browsers');
}

main().catch(console.error);
