import { useState, useEffect, useRef } from 'react';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import {
  Package,
  Layers,
  DollarSign,
  Tag,
  Image as ImageIcon,
  Plus,
  Trash2,
  AlertCircle,
  UploadCloud,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplace.store.ts';
import type {
  MarketplaceProduct,
  MarketplaceCategory,
  ProductType,
  CreateProductPayload,
} from '@/types/index.ts';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: MarketplaceProduct | null;
  onSave: (payload: CreateProductPayload, submitImmediately: boolean) => Promise<void>;
  isSubmitting?: boolean;
  businessId?: string;
}

const CATEGORIES: Array<{ value: MarketplaceCategory; label: string }> = [
  { value: 'fashion', label: 'Fashion & Apparel' },
  { value: 'bags', label: 'Bags & Luggage' },
  { value: 'electronics', label: 'Electronics & Gadgets' },
  { value: 'furniture', label: 'Home & Furniture' },
  { value: 'food', label: 'Food & Groceries' },
  { value: 'books', label: 'Books & Stationery' },
  { value: 'services', label: 'Professional Services' },
  { value: 'other', label: 'Other Products' },
];

type TabKey = 'details' | 'pricing' | 'attributes' | 'media';

const TABS: Array<{ key: TabKey; label: string; step: number; icon: any }> = [
  { key: 'details', label: 'Basic Details', step: 1, icon: Layers },
  { key: 'pricing', label: 'Pricing & Stock', step: 2, icon: DollarSign },
  { key: 'attributes', label: 'Category Specs', step: 3, icon: Tag },
  { key: 'media', label: 'Media & Contact', step: 4, icon: ImageIcon },
];

export default function ProductModal({
  isOpen,
  onClose,
  product,
  onSave,
  isSubmitting = false,
  businessId,
}: ProductModalProps) {
  const isEditing = Boolean(product);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form State
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [name, setName] = useState('');
  const [productType, setProductType] = useState<ProductType>('physical');
  const [category, setCategory] = useState<MarketplaceCategory>('fashion');
  const [description, setDescription] = useState('');

  const [price, setPrice] = useState<string>('');
  const [compareAtPrice, setCompareAtPrice] = useState<string>('');
  const [trackInventory, setTrackInventory] = useState(true);
  const [stockQuantity, setStockQuantity] = useState<string>('1');

  // Images state
  const [images, setImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlFallback, setShowUrlFallback] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');

  const [contactPhone, setContactPhone] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');

  // Category attributes dictionary
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize or reset form on open/edit
  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setProductType(product.productType || 'physical');
      setCategory(product.category || 'fashion');
      setDescription(product.description || '');
      setPrice(product.price ? String(product.price) : '');
      setCompareAtPrice(product.compareAtPrice ? String(product.compareAtPrice) : '');
      setTrackInventory(product.trackInventory ?? true);
      setStockQuantity(product.stockQuantity !== null && product.stockQuantity !== undefined ? String(product.stockQuantity) : '');
      setImages(product.images || []);
      setContactPhone(product.contactPhone || '');
      setContactWhatsapp(product.contactWhatsapp || '');
      setPurchaseUrl(product.purchaseUrl || '');
      setAttributes(product.attributes ? { ...product.attributes } : {});
    } else {
      setName('');
      setProductType('physical');
      setCategory('fashion');
      setDescription('');
      setPrice('');
      setCompareAtPrice('');
      setTrackInventory(true);
      setStockQuantity('1');
      setImages([]);
      setContactPhone('');
      setContactWhatsapp('');
      setPurchaseUrl('');
      setAttributes({ size: 'M', color: 'Black', gender: 'unisex' });
    }
    setActiveTab('details');
    setValidationError(null);
    setUploadError(null);
    setShowUrlFallback(false);
    setNewImageUrl('');
  }, [product, isOpen]);

  // Adjust defaults when category changes
  const handleCategoryChange = (newCat: MarketplaceCategory) => {
    setCategory(newCat);
    if (newCat === 'services') {
      setProductType('service');
      setTrackInventory(false);
      setStockQuantity('');
      setAttributes({ deliveryMethod: 'remote', serviceDurationMinutes: 60 });
    } else {
      if (newCat === 'fashion') {
        setAttributes({ size: 'M', color: 'Black', gender: 'unisex' });
      } else if (newCat === 'bags') {
        setAttributes({ bagType: 'backpack', material: 'Leather' });
      } else if (newCat === 'electronics') {
        setAttributes({ brand: '', model: '', warrantyMonths: 12 });
      } else if (newCat === 'books') {
        setAttributes({ author: '', format: 'paperback' });
      } else if (newCat === 'food') {
        setAttributes({ perishable: false });
      } else if (newCat === 'furniture') {
        setAttributes({ material: 'Wood', assemblyRequired: false });
      } else {
        setAttributes({});
      }
    }
  };

  // ── Image Upload Handling (Cloudinary) ──
  const handleFilesChosen = async (files: FileList | File[]) => {
    setUploadError(null);
    setValidationError(null);

    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    if (images.length + fileList.length > 3) {
      setUploadError(`You can only have up to 3 images per product. You already have ${images.length}.`);
      return;
    }

    if (!businessId) {
      setUploadError('Business context is required to upload images.');
      return;
    }

    const uploadImageFn = useMarketplaceStore.getState().uploadImage;

    setIsUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of fileList) {
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
          throw new Error(`"${file.name}" is not a supported format. Please use JPEG, PNG, or WebP.`);
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`"${file.name}" exceeds the 5MB size limit.`);
        }

        const res = await uploadImageFn(businessId, file);
        if (res && res.url) {
          uploadedUrls.push(res.url);
        }
      }
      setImages((prev) => [...prev, ...uploadedUrls]);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload image to Cloudinary');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, idx) => idx !== index));
  };

  const handleAddManualImageUrl = () => {
    if (!newImageUrl.trim()) return;
    if (images.length >= 3) {
      setUploadError('You can add up to 3 product images.');
      return;
    }
    if (!newImageUrl.startsWith('http://') && !newImageUrl.startsWith('https://')) {
      setUploadError('Image URL must start with http:// or https://');
      return;
    }
    setImages([...images, newImageUrl.trim()]);
    setNewImageUrl('');
    setUploadError(null);
  };

  // ── Step Validations ──
  const validateCurrentStep = (targetStep: TabKey): boolean => {
    setValidationError(null);
    if (activeTab === 'details') {
      if (!name.trim() || name.trim().length < 3) {
        setValidationError('Product name must be at least 3 characters.');
        return false;
      }
      if (!description.trim() || description.trim().length < 10) {
        setValidationError('Product description must be at least 10 characters.');
        return false;
      }
    }

    if (activeTab === 'pricing' || targetStep === 'attributes' || targetStep === 'media') {
      const numPrice = Number(price);
      if (!numPrice || numPrice <= 0) {
        setValidationError('Please enter a valid price greater than 0.');
        setActiveTab('pricing');
        return false;
      }
      if (compareAtPrice) {
        const numCompare = Number(compareAtPrice);
        if (numCompare < numPrice) {
          setValidationError('Compare-at price cannot be lower than the selling price.');
          setActiveTab('pricing');
          return false;
        }
      }
      if (productType === 'physical' && trackInventory) {
        const qty = parseInt(stockQuantity, 10);
        if (isNaN(qty) || qty < 0) {
          setValidationError('Please provide a valid stock quantity (0 or greater).');
          setActiveTab('pricing');
          return false;
        }
      }
    }

    return true;
  };

  const handleContinue = (nextTab: TabKey) => {
    if (validateCurrentStep(nextTab)) {
      setActiveTab(nextTab);
    }
  };

  const validateAllForSubmission = (submitImmediately: boolean): boolean => {
    setValidationError(null);
    if (!name.trim() || name.trim().length < 3) {
      setValidationError('Product name must be at least 3 characters.');
      setActiveTab('details');
      return false;
    }
    if (!description.trim() || description.trim().length < 10) {
      setValidationError('Product description must be at least 10 characters.');
      setActiveTab('details');
      return false;
    }
    const numPrice = Number(price);
    if (!numPrice || numPrice <= 0) {
      setValidationError('Please enter a valid price greater than 0.');
      setActiveTab('pricing');
      return false;
    }
    if (compareAtPrice) {
      const numCompare = Number(compareAtPrice);
      if (numCompare < numPrice) {
        setValidationError('Compare-at price cannot be lower than the selling price.');
        setActiveTab('pricing');
        return false;
      }
    }
    if (productType === 'physical' && trackInventory) {
      const qty = parseInt(stockQuantity, 10);
      if (isNaN(qty) || qty < 0) {
        setValidationError('Please provide a valid stock quantity (0 or greater).');
        setActiveTab('pricing');
        return false;
      }
    }
    if (submitImmediately && images.length === 0) {
      setValidationError('At least one product image is required to submit for marketplace moderation review.');
      setActiveTab('media');
      return false;
    }
    return true;
  };

  const handleSubmit = async (submitImmediately: boolean) => {
    if (!validateAllForSubmission(submitImmediately)) return;

    const payload: CreateProductPayload = {
      name: name.trim(),
      productType,
      category,
      description: description.trim(),
      price: Number(price),
      compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
      currency: 'NGN',
      trackInventory: productType === 'physical' ? trackInventory : false,
      stockQuantity:
        productType === 'physical' && trackInventory
          ? parseInt(stockQuantity, 10) || 0
          : null,
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
      images,
      contactPhone: contactPhone.trim() || null,
      contactWhatsapp: contactWhatsapp.trim() || null,
      purchaseUrl: purchaseUrl.trim() || null,
    };

    try {
      await onSave(payload, submitImmediately);
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save product');
    }
  };

  // Find step position
  const currentStep = TABS.find((t) => t.key === activeTab)?.step || 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Product Listing' : 'Create Marketplace Product'}
      subtitle={isEditing ? 'Update details or submit changes for review.' : 'Add a product to your active 3-product inventory showcase.'}
      icon={<Package className="w-5 h-5 text-purple-600" />}
      size="lg"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3 pt-2">
          {/* Left Action Button */}
          {activeTab === 'details' ? (
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting || isUploadingImage} className="w-full sm:w-auto">
              Cancel
            </Button>
          ) : activeTab === 'pricing' ? (
            <Button
              variant="ghost"
              onClick={() => setActiveTab('details')}
              disabled={isSubmitting || isUploadingImage}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Details
            </Button>
          ) : activeTab === 'attributes' ? (
            <Button
              variant="ghost"
              onClick={() => setActiveTab('pricing')}
              disabled={isSubmitting || isUploadingImage}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Pricing
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setActiveTab('attributes')}
              disabled={isSubmitting || isUploadingImage}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Specs
            </Button>
          )}

          {/* Right Action Button(s) */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeTab === 'details' && (
              <Button
                variant="primary"
                onClick={() => handleContinue('pricing')}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Continue to Pricing <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}

            {activeTab === 'pricing' && (
              <Button
                variant="primary"
                onClick={() => handleContinue('attributes')}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Continue to Specifications <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}

            {activeTab === 'attributes' && (
              <Button
                variant="primary"
                onClick={() => handleContinue('media')}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Continue to Media &amp; Contact <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}

            {/* ONLY ON STEP 4: SUBMIT BUTTONS */}
            {activeTab === 'media' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(false)}
                  disabled={isSubmitting || isUploadingImage}
                  className="w-full sm:w-auto"
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleSubmit(true)}
                  disabled={isSubmitting || isUploadingImage}
                  isLoading={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  {isEditing ? 'Save & Submit' : 'Submit for Review'}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Step Progress & Tab Navigation */}
        <div className="border-b border-gray-200 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
              Step {currentStep} of 4: {TABS.find((t) => t.key === activeTab)?.label}
            </span>
            <span className="text-xs text-gray-400">
              {currentStep === 4 ? 'Final Step — Ready for Submission' : 'Complete details to proceed'}
            </span>
          </div>

          <div className="flex gap-2">
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              const isPast = tab.step < currentStep;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (tab.step < currentStep || validateCurrentStep(tab.key)) {
                      setActiveTab(tab.key);
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-sm'
                      : isPast
                      ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* ── TAB 1: BASIC DETAILS ── */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as MarketplaceCategory)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product or Service Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. Handmade Leather Travel Bag"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Must be at least 3 characters. A unique URL slug will be automatically created.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item, key highlights, materials, warranty, or delivery details..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Provide at least 10 characters detailing what you are offering to buyers.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB 2: PRICING & STOCK ── */}
        {activeTab === 'pricing' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selling Price (NGN) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 25000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Compare-at Price (NGN) <span className="text-gray-400 font-normal">(Optional Strikethrough)</span>
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 35000"
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Offering Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="productType"
                    value="physical"
                    checked={productType === 'physical'}
                    onChange={() => {
                      setProductType('physical');
                      setTrackInventory(true);
                    }}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span>Physical Good (Requires Stock)</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="productType"
                    value="service"
                    checked={productType === 'service'}
                    onChange={() => {
                      setProductType('service');
                      setTrackInventory(false);
                      setStockQuantity('');
                    }}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span>Service / Digital</span>
                </label>
              </div>
            </div>

            {productType === 'physical' && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Track Inventory Quantity</p>
                    <p className="text-xs text-gray-500">Prevent sales if stock runs out</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                </div>

                {trackInventory && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Available Stock Quantity <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g. 10"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      min="0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: CATEGORY SPECS ── */}
        {activeTab === 'attributes' && (
          <div className="space-y-4">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800">
              Category specifications for <strong className="capitalize">{category}</strong> items help customers discover and filter your product.
            </div>

            {category === 'fashion' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Size</label>
                  <Input
                    placeholder="e.g. S, M, L, XL, 42"
                    value={attributes.size || ''}
                    onChange={(e) => setAttributes({ ...attributes, size: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                  <Input
                    placeholder="e.g. Black, Navy, Brown"
                    value={attributes.color || ''}
                    onChange={(e) => setAttributes({ ...attributes, color: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    value={attributes.gender || 'unisex'}
                    onChange={(e) => setAttributes({ ...attributes, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="unisex">Unisex</option>
                    <option value="kids">Kids</option>
                  </select>
                </div>
              </div>
            )}

            {category === 'bags' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bag Type</label>
                  <Input
                    placeholder="e.g. Backpack, Tote, Duffle"
                    value={attributes.bagType || ''}
                    onChange={(e) => setAttributes({ ...attributes, bagType: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Material</label>
                  <Input
                    placeholder="e.g. Leather, Canvas, Nylon"
                    value={attributes.material || ''}
                    onChange={(e) => setAttributes({ ...attributes, material: e.target.value })}
                  />
                </div>
              </div>
            )}

            {category === 'electronics' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
                  <Input
                    placeholder="e.g. Sony, Apple, Samsung"
                    value={attributes.brand || ''}
                    onChange={(e) => setAttributes({ ...attributes, brand: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Model / Reference</label>
                  <Input
                    placeholder="e.g. WH-1000XM5"
                    value={attributes.model || ''}
                    onChange={(e) => setAttributes({ ...attributes, model: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Warranty (Months)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 12"
                    value={attributes.warrantyMonths ?? ''}
                    onChange={(e) => setAttributes({ ...attributes, warrantyMonths: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}

            {category === 'services' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Method</label>
                  <select
                    value={attributes.deliveryMethod || 'remote'}
                    onChange={(e) => setAttributes({ ...attributes, deliveryMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="remote">Online / Remote Delivery</option>
                    <option value="on_site">On-Site / Physical Visit</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Duration (Minutes)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 60"
                    value={attributes.serviceDurationMinutes ?? ''}
                    onChange={(e) => setAttributes({ ...attributes, serviceDurationMinutes: Number(e.target.value) || 60 })}
                  />
                </div>
              </div>
            )}

            {category !== 'fashion' && category !== 'bags' && category !== 'electronics' && category !== 'services' && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                General product attributes. Additional custom specifications can be entered in the product description.
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: MEDIA & CONTACT (FINAL STEP) ── */}
        {activeTab === 'media' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-900">
                  Product Images (Max 3) <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-purple-700 font-medium">
                  {images.length} of 3 images uploaded
                </span>
              </div>

              {/* Upload Error Banner */}
              {uploadError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Image Previews Grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {images.map((url, idx) => (
                  <div key={idx} className="relative aspect-square border border-gray-200 rounded-xl overflow-hidden bg-gray-50 shadow-xs group">
                    <img src={url} alt={`Product preview ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      disabled={isUploadingImage}
                      title="Remove image"
                      className="absolute top-1.5 right-1.5 p-1.5 bg-red-600 text-white rounded-full shadow hover:bg-red-700 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {idx === 0 && (
                      <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-purple-900 bg-opacity-80 text-white text-[10px] rounded-md font-semibold tracking-wide">
                        Cover Photo
                      </span>
                    )}
                  </div>
                ))}

                {/* Empty Slot Indicators */}
                {Array.from({ length: Math.max(0, 3 - images.length) }).map((_, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (images.length < 3 && fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    }}
                    className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center p-2 text-center text-xs text-gray-400 hover:border-purple-300 hover:bg-purple-50/30 cursor-pointer transition"
                  >
                    <ImageIcon className="w-6 h-6 mb-1 text-gray-300" />
                    <span>Slot {images.length + i + 1} of 3</span>
                  </div>
                ))}
              </div>

              {/* Cloudinary Drag & Drop Upload Zone */}
              {images.length < 3 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesChosen(e.dataTransfer.files);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
                    isUploadingImage
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-purple-200 bg-purple-50/40 hover:bg-purple-50/80 hover:border-purple-400'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files) handleFilesChosen(e.target.files);
                    }}
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                  />
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <Loader2 className="w-7 h-7 text-purple-600 animate-spin" />
                      <p className="text-sm font-semibold text-purple-900">Uploading to Cloudinary...</p>
                      <p className="text-xs text-purple-600">Optimizing and storing your product image</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          Click to browse or drag &amp; drop product photos
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          JPEG, PNG, or WebP up to 5MB (Max 3 images total)
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Secondary URL Input Option */}
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => setShowUrlFallback(!showUrlFallback)}
                  className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
                >
                  {showUrlFallback ? 'Hide URL input' : 'Or paste direct image URL'}
                </button>
              </div>

              {showUrlFallback && images.length < 3 && (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="https://res.cloudinary.com/... or image link"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    className="flex-1 text-xs"
                  />
                  <Button type="button" variant="outline" onClick={handleAddManualImageUrl} className="flex-shrink-0 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add URL
                  </Button>
                </div>
              )}
            </div>

            <hr className="border-gray-200" />

            {/* Direct Contact & Inquiry Channels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Inquiry Phone
                </label>
                <Input
                  placeholder="+234 800 000 0000"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WhatsApp Direct Number
                </label>
                <Input
                  placeholder="+234 800 000 0000"
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direct Checkout / Store Link <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <Input
                placeholder="https://yourstore.com/checkout/item-1"
                value={purchaseUrl}
                onChange={(e) => setPurchaseUrl(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                If provided, buyers on WallX Marketplace will see a direct checkout button pointing to your website.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
