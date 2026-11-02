import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock auth & subscription middleware to pass transparently
jest.mock('@/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'usr_test_123', email: 'test@example.com' };
    next();
  },
}));

jest.mock('@/middleware/subscription', () => ({
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('@/services/tax/tax-profile.service', () => ({
  getTaxProfile: jest.fn(),
  saveTaxProfile: jest.fn(),
  deleteTaxProfile: jest.fn(),
  getObligationReportPdf: jest.fn(),
}));

import * as taxProfileService from '@/services/tax/tax-profile.service';
import taxProfileRoutes from '@/routes/tax-profile.routes';
import { errorHandler } from '@/middleware/errorHandler';

describe('Tax Profile Routes — API Unit Tests', () => {
  let app: express.Express;
  const businessId = 'biz_12345';

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/businesses/:businessId/tax-profile', taxProfileRoutes);
    app.use(errorHandler);
  });

  const validAnswers = {
    legalStructure: 'LLC',
    annualTurnover: 'UNDER_25M',
    fixedAssetsValue: 'UNDER_250M',
    businessType: 'STANDARD',
    hasEmployeesAbove800k: false,
    isMultiState: false,
    hasDigitalAssets: false,
    isExportOriented: false,
    hasCorporateClientsWithWHT: false,
    isInFreeTradeZone: false,
  };

  it('GET /businesses/:businessId/tax-profile returns profile data', async () => {
    const mockProfile = { id: 'prof_1', businessId, quizAnswers: validAnswers };
    (taxProfileService.getTaxProfile as any).mockResolvedValue(mockProfile);

    const res = await request(app).get(`/businesses/${businessId}/tax-profile`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockProfile);
    expect(taxProfileService.getTaxProfile).toHaveBeenCalledWith('usr_test_123', businessId);
  });

  it('POST /businesses/:businessId/tax-profile saves valid answers', async () => {
    const mockResult = {
      profile: { id: 'prof_1', businessId },
      config: { vatExempt: true, citRate: 0 },
    };
    (taxProfileService.saveTaxProfile as any).mockResolvedValue(mockResult);

    const res = await request(app)
      .post(`/businesses/${businessId}/tax-profile`)
      .send({ answers: validAnswers });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockResult);
    expect(taxProfileService.saveTaxProfile).toHaveBeenCalledWith('usr_test_123', businessId, validAnswers);
  });

  it('POST /businesses/:businessId/tax-profile rejects invalid turnover option with 400', async () => {
    const invalidAnswers = {
      ...validAnswers,
      annualTurnover: 'INVALID_TURNOVER_VALUE',
    };

    const res = await request(app)
      .post(`/businesses/${businessId}/tax-profile`)
      .send({ answers: invalidAnswers });

    expect(res.status).toBe(400);
    expect(taxProfileService.saveTaxProfile).not.toHaveBeenCalled();
  });

  it('DELETE /businesses/:businessId/tax-profile deletes profile', async () => {
    (taxProfileService.deleteTaxProfile as any).mockResolvedValue({ id: 'prof_1' });

    const res = await request(app).delete(`/businesses/${businessId}/tax-profile`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(taxProfileService.deleteTaxProfile).toHaveBeenCalledWith('usr_test_123', businessId);
  });

  it('GET /businesses/:businessId/tax-profile/pdf streams PDF with application/pdf header', async () => {
    const fakeBuffer = Buffer.from('%PDF-1.4 Fake PDF Content');
    (taxProfileService.getObligationReportPdf as any).mockResolvedValue(fakeBuffer);

    const res = await request(app).get(`/businesses/${businessId}/tax-profile/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`tax-obligation-report-${businessId}.pdf`);
  });

  it('GET /businesses/:businessId/tax-profile/obligation-report.pdf streams PDF with application/pdf header', async () => {
    const fakeBuffer = Buffer.from('%PDF-1.4 Fake PDF Content');
    (taxProfileService.getObligationReportPdf as any).mockResolvedValue(fakeBuffer);

    const res = await request(app).get(`/businesses/${businessId}/tax-profile/obligation-report.pdf`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`tax-obligation-report-${businessId}.pdf`);
  });
});
