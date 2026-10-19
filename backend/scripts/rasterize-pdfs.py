import os
import pymupdf

PDF_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../pdf-renders'))
IMG_DIR = os.path.join(PDF_DIR, 'images')
os.makedirs(IMG_DIR, exist_ok=True)

for fname in sorted(os.listdir(PDF_DIR)):
    if not fname.endswith('.pdf'):
        continue
    pdf_path = os.path.join(PDF_DIR, fname)
    doc = pymupdf.open(pdf_path)
    base_name = os.path.splitext(fname)[0]
    print(f"Rasterizing {fname} ({len(doc)} pages)...")
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(dpi=150)
        img_path = os.path.join(IMG_DIR, f"{base_name}_p{page_num + 1}.png")
        pix.save(img_path)
        print(f"  -> Saved {img_path}")

print("Rasterization complete!")
