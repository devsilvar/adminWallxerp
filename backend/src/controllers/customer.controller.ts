/**
 * Customer 360 Controller
 *
 * Exposes endpoints for Customer 360 details, unified history timeline,
 * customer updates (and archiving), and history-guarded deletion.
 *
 * @author WallX Engineering Team
 */

import { Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import * as customerService from '@/services/customer.service';
import {
  updateCustomerSchema,
  customerHistoryQuerySchema,
} from '@/validators/customer-card.validator';

export const getDetail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await customerService.getCustomerDetail(
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

export const getHistory = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = customerHistoryQuerySchema.parse(req.query);
    const result = await customerService.getCustomerHistory(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      query
    );

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  }
);

export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const payload = updateCustomerSchema.parse(req.body);
    const result = await customerService.updateCustomer(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId,
      payload
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Customer updated successfully',
    });
  }
);

export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await customerService.deleteCustomer(
      req.user!.userId,
      req.params.businessId,
      req.params.customerId
    );

    res.status(200).json(result);
  }
);
