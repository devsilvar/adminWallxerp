import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { toNumber } from '@/shared/helpers';
import {
  ACCRUAL_SALE_INCLUDE,
  isAccrualLinked,
} from '@/shared/helpers/accrual';
import {
  applyReassignment,
  applyVerification,
} from '@/services/sales/sales-verification.service';
import logger from '@/lib/logger';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';

export interface ListUnverifiedInflowsQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export async function listUnverifiedInflows(query?: ListUnverifiedInflowsQuery) {
  const page = query?.page ?? 1;
  const limit = query?.limit ?? 20;
  const offset = (page - 1) * limit;
  const search = query?.search?.trim();

  const where: Prisma.SalesTransactionWhereInput = {
    needsVerification: true,
    ...(search
      ? {
          OR: [
            { referenceId: { contains: search, mode: 'insensitive' } },
            { customerHint: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            {
              business: {
                OR: [
                  { businessName: { contains: search, mode: 'insensitive' } },
                  { merchantId: { contains: search, mode: 'insensitive' } },
                  { user: { email: { contains: search, mode: 'insensitive' } } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [sales, total] = await Promise.all([
    prisma.salesTransaction.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { transactionDate: 'desc' },
      select: {
        id: true,
        businessId: true,
        amount: true,
        source: true,
        status: true,
        referenceId: true,
        customerHint: true,
        customerName: true,
        description: true,
        transactionDate: true,
        needsVerification: true,
        createdAt: true,
        // QA-04: the admin list offers reassignment, so it needs the same
        // accrual signal the guard enforces — otherwise the row shows a button
        // that 409s on click.
        ...ACCRUAL_SALE_INCLUDE,
        business: {
          select: {
            id: true,
            businessName: true,
            merchantId: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.salesTransaction.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Efficiently fetch sibling businesses for all distinct users on this page without N+1
  const userIds = [
    ...new Set(sales.map((s) => s.business.user?.id).filter(Boolean)),
  ] as string[];

  const allUserBusinesses =
    userIds.length > 0
      ? await prisma.business.findMany({
          where: { userId: { in: userIds } },
          select: {
            id: true,
            userId: true,
            businessName: true,
            merchantId: true,
          },
          orderBy: { businessName: 'asc' },
        })
      : [];

  const data = sales.map((sale) => {
    const siblings = allUserBusinesses
      .filter((b) => b.userId === sale.business.user?.id && b.id !== sale.businessId)
      .map(({ id, businessName, merchantId }) => ({ id, businessName, merchantId }));

    return {
      ...sale,
      amount: toNumber(sale.amount),
      accrualLinked: isAccrualLinked(sale),
      siblingBusinesses: siblings,
    };
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function adminReassignSale(
  adminUserId: string,
  saleId: string,
  targetBusinessId: string
) {
  return applyReassignment({
    saleId,
    targetBusinessId,
    actor: { kind: 'admin', adminUserId },
  });
}

export async function adminVerifySale(
  adminUserId: string,
  saleId: string,
  input: {
    classificationName: string;
    customerName?: string;
    description?: string;
    targetBusinessId?: string;
  }
) {
  const result = await applyVerification({
    saleId,
    classificationName: input.classificationName,
    actor: { kind: 'admin', adminUserId },
    meta: {
      customerName: input.customerName,
      description: input.description,
      targetBusinessId: input.targetBusinessId,
    },
  });

  void emitToAdmins({
    type: 'unverified_inflow_verified',
    saleId: result.id,
    businessId: result.businessId,
    timestamp: new Date().toISOString(),
  }).catch((err) =>
    logger.warn('Failed to emit unverified_inflow_verified to admins', { saleId: result.id, err })
  );

  return result;
}
