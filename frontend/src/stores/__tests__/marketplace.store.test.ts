import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/axios';
import { useMarketplaceStore } from '@/stores/marketplace.store';
import type { MarketplaceProduct, CreateProductPayload } from '@/types/index';

describe('useMarketplaceStore - Unit & Integration Tests (Phase 7)', () => {
  const businessId = 'biz_test_123';

  const sampleProduct: MarketplaceProduct = {
    id: 'prod_1',
    businessId,
    name: 'Executive Leather Briefcase',
    slug: 'executive-leather-briefcase-123',
    productType: 'physical',
    category: 'bags',
    description: 'High-end genuine leather briefcase with brass hardware.',
    price: 45000,
    compareAtPrice: 50000,
    currency: 'NGN',
    stockQuantity: 10,
    trackInventory: true,
    attributes: { bagType: 'briefcase', material: 'Leather' },
    images: ['https://res.cloudinary.com/wallx/image/upload/v1/briefcase.jpg'],
    contactPhone: '+2348011223344',
    contactWhatsapp: '+2348011223344',
    purchaseUrl: 'https://pay.paymytax.ng/item/1',
    status: 'draft',
    rejectionReason: null,
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useMarketplaceStore.getState().clear();
  });

  it('fetchProducts retrieves products list and updates store state', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: [sampleProduct],
      },
    });

    await useMarketplaceStore.getState().fetchProducts(businessId);

    const state = useMarketplaceStore.getState();
    expect(state.products).toHaveLength(1);
    expect(state.products[0].id).toBe('prod_1');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(api.get).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace`);
  });

  it('fetchProducts sets error state on network or server failure', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Failed to retrieve products'));

    await useMarketplaceStore.getState().fetchProducts(businessId);

    const state = useMarketplaceStore.getState();
    expect(state.products).toHaveLength(0);
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Failed to retrieve products');
  });

  it('createProduct adds new product to top of products list', async () => {
    const newPayload: CreateProductPayload = {
      name: 'Leather Shoes',
      productType: 'physical',
      category: 'fashion',
      description: 'Handmade Italian leather dress shoes.',
      price: 60000,
      stockQuantity: 5,
      trackInventory: true,
    };

    const createdProduct: MarketplaceProduct = {
      ...sampleProduct,
      id: 'prod_2',
      name: 'Leather Shoes',
      category: 'fashion',
      price: 60000,
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: createdProduct,
      },
    });

    const result = await useMarketplaceStore.getState().createProduct(businessId, newPayload);

    const state = useMarketplaceStore.getState();
    expect(result.id).toBe('prod_2');
    expect(state.products).toHaveLength(1);
    expect(state.products[0].name).toBe('Leather Shoes');
    expect(state.submitting).toBe(false);
    expect(api.post).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace`, newPayload);
  });

  it('updateProduct updates existing product in place in products array', async () => {
    useMarketplaceStore.setState({
      products: [sampleProduct],
    });

    const updatedProduct: MarketplaceProduct = {
      ...sampleProduct,
      price: 42000,
      status: 'pending_approval',
    };

    vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: {
        success: true,
        data: updatedProduct,
      },
    });

    const result = await useMarketplaceStore.getState().updateProduct(businessId, 'prod_1', {
      price: 42000,
    });

    const state = useMarketplaceStore.getState();
    expect(result.price).toBe(42000);
    expect(state.products[0].price).toBe(42000);
    expect(state.products[0].status).toBe('pending_approval');
    expect(api.patch).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace/prod_1`, {
      price: 42000,
    });
  });

  it('submitForApproval transitions product to pending_approval in list', async () => {
    useMarketplaceStore.setState({
      products: [sampleProduct],
    });

    const submittedProduct: MarketplaceProduct = {
      ...sampleProduct,
      status: 'pending_approval',
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: submittedProduct,
      },
    });

    const result = await useMarketplaceStore.getState().submitForApproval(businessId, 'prod_1');

    const state = useMarketplaceStore.getState();
    expect(result.status).toBe('pending_approval');
    expect(state.products[0].status).toBe('pending_approval');
    expect(api.post).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace/prod_1/submit`);
  });

  it('archiveProduct marks product as archived, freeing active slot', async () => {
    useMarketplaceStore.setState({
      products: [sampleProduct],
    });

    const archivedProduct: MarketplaceProduct = {
      ...sampleProduct,
      status: 'archived',
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: archivedProduct,
      },
    });

    const result = await useMarketplaceStore.getState().archiveProduct(businessId, 'prod_1');

    const state = useMarketplaceStore.getState();
    expect(result.status).toBe('archived');
    expect(state.products[0].status).toBe('archived');
    expect(api.post).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace/prod_1/archive`);
  });

  it('uploadImage sends FormData and returns Cloudinary url + publicId', async () => {
    const mockFile = new File(['image-content'], 'product.jpg', { type: 'image/jpeg' });
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          url: 'https://res.cloudinary.com/wallx/image/upload/v1/marketplace/biz_123/prod.jpg',
          publicId: 'paymytax/marketplace/biz_123/prod',
        },
      },
    });

    const result = await useMarketplaceStore.getState().uploadImage(businessId, mockFile);

    expect(result.url).toContain('https://res.cloudinary.com');
    expect(result.publicId).toBe('paymytax/marketplace/biz_123/prod');
    expect(api.post).toHaveBeenCalledWith(
      `/businesses/${businessId}/marketplace/images`,
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    );
  });

  it('uploadImage throws formatted error when api call fails', async () => {
    const mockFile = new File(['bad-content'], 'malware.exe', { type: 'application/octet-stream' });
    vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Invalid image file'));

    await expect(
      useMarketplaceStore.getState().uploadImage(businessId, mockFile)
    ).rejects.toThrow('Invalid image file');
  });

  it('deleteImage sends DELETE request with publicId payload', async () => {
    vi.spyOn(api, 'delete').mockResolvedValueOnce({
      data: { success: true },
    });

    await useMarketplaceStore.getState().deleteImage(businessId, 'paymytax/marketplace/biz_123/prod');

    expect(api.delete).toHaveBeenCalledWith(`/businesses/${businessId}/marketplace/images`, {
      data: { publicId: 'paymytax/marketplace/biz_123/prod' },
    });
  });

  it('setActiveProduct and clearActive toggle active item', () => {
    useMarketplaceStore.getState().setActiveProduct(sampleProduct);
    expect(useMarketplaceStore.getState().activeProduct?.id).toBe('prod_1');

    useMarketplaceStore.getState().clearActive();
    expect(useMarketplaceStore.getState().activeProduct).toBeNull();
  });

  it('clear completely wipes store state', () => {
    useMarketplaceStore.setState({
      products: [sampleProduct],
      error: 'Some error',
      activeProduct: sampleProduct,
    });

    useMarketplaceStore.getState().clear();

    const state = useMarketplaceStore.getState();
    expect(state.products).toHaveLength(0);
    expect(state.error).toBeNull();
    expect(state.activeProduct).toBeNull();
  });
});
