import { Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import * as customerCardService from '@/services/customer-card.service';
import {
  listCustomersQuerySchema,
  listCardActivityQuerySchema,
  quickCreateCustomerSchema,
  quickCreateCustomerWithVoucherSchema,
  topUpCardSchema,
  changeCreditSchema,
  adjustCardSchema,
  changeVoucherPinSchema,
  voucherLookupSchema,
  customerBonusSchema,
} from '@/validators/customer-card.validator';

export const getStats = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await customerCardService.getStoreCardStats(
      req.user!.userId,
      req.params.businessId
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const listActivity = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listCardActivityQuerySchema.parse(req.query);
    const result = await customerCardService.listStoreCardActivity(
      req.user!.userId,
      req.params.businessId,
      query
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const listCustomers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = listCustomersQuerySchema.parse(req.query);
    const result = await customerCardService.searchCustomers(
      req.user!.userId,
      req.params.businessId,
      query
    );
    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const voucherLookup = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { pin, last4 } = voucherLookupSchema.parse(req.body);
    const data = await customerCardService.lookupVoucherByPin(
      req.user!.userId,
      req.params.businessId,
      pin,
      last4
    );
    res.status(200).json({ success: true, data });
  }
);

export const quickCreate = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = quickCreateCustomerSchema.parse(req.body);
    const result = await customerCardService.quickCreateCustomer(
      req.user!.userId,
      req.params.businessId,
      data
    );
    res.status(201).json({
      success: true,
      data: result,
      message: 'Customer and virtual card created successfully',
    });
  }
);

export const quickCreateWithVoucher = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = quickCreateCustomerWithVoucherSchema.parse(req.body);
    const result = await customerCardService.quickCreateCustomerWithVoucher(
      req.user!.userId,
      req.params.businessId,
      data
    );
    res.status(201).json({
      success: true,
      data: result,
      message: 'Customer and virtual card created successfully',
    });
  }
);

export const getCard = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await customerCardService.getCustomerCard(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const topUp = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = topUpCardSchema.parse(req.body);
    const direct = req.query.direct === 'true';
    const result = await customerCardService.topUpCard(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      data,
      { direct, origin: req.get('origin') }
    );
    if ('status' in result && result.status === 'pending') {
      res.status(202).json({
        success: true,
        ...result,
        message: 'Top-up request queued for manager authorization',
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: result,
      message: 'Card balance topped up successfully',
    });
  }
);

export const creditChange = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = changeCreditSchema.parse(req.body);
    const result = await customerCardService.creditChange(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      data
    );
    res.status(200).json({
      success: true,
      data: result,
      message: 'Change credited to virtual card successfully',
    });
  }
);

export const adjust = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = adjustCardSchema.parse(req.body);
    const result = await customerCardService.adjustCardBalance(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      data
    );
    res.status(200).json({
      success: true,
      data: result,
      message: 'Card balance adjusted successfully',
    });
  }
);

export const resendPin = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await customerCardService.resendVoucherPin(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId
    );
    res.status(200).json({
      success: true,
      message: result.message,
    });
  }
);

export const changePin = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { oldPin, newPin, last4Phone } = changeVoucherPinSchema.parse(req.body);
    const result = await customerCardService.changeVoucherPin(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      oldPin,
      newPin,
      last4Phone
    );
    res.status(200).json({
      success: true,
      message: result.message,
    });
  }
);

export const updateCustomerBonus = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { voucherBonusPct } = customerBonusSchema.parse(req.body);
    const result = await customerCardService.updateCustomerVoucherBonus(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      voucherBonusPct
    );
    res.status(200).json({ success: true, data: result, message: 'Customer bonus updated' });
  }
);
