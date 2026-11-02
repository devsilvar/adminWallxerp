import { z } from 'zod';

export const saveTaxProfileSchema = z.object({
  answers: z.object({
    legalStructure: z.enum(['UNREGISTERED', 'BUSINESS_NAME', 'LLC']),
    annualTurnover: z.enum(['UNDER_25M', 'M25M_TO_50M', 'M50M_TO_100M', 'ABOVE_100M', 'UNKNOWN']),
    fixedAssetsValue: z.enum(['UNDER_250M', 'ABOVE_250M']),
    businessType: z.enum(['STANDARD', 'PROFESSIONAL', 'TECH_SOFTWARE', 'AGRICULTURE', 'REGULATED_FINANCIAL', 'OTHER']),
    businessTypeOther: z.string().max(200).optional(),
    hasEmployeesAbove800k: z.boolean(),
    isMultiState: z.boolean(),
    hasDigitalAssets: z.boolean(),
    isExportOriented: z.boolean(),
    hasCorporateClientsWithWHT: z.boolean(),
    isInFreeTradeZone: z.boolean(),
  }),
});

export type SaveTaxProfileInput = z.infer<typeof saveTaxProfileSchema>;
