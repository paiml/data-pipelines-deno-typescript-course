import { z } from "zod";

/**
 * EUR currency input schema
 */
export const EURAmountSchema = z.object({
  amount: z.number().finite(),
  currency: z.literal("EUR"),
  precision: z.number().int().min(0).max(10).optional(),
});

export type EURAmount = z.infer<typeof EURAmountSchema>;

/**
 * USD currency output schema
 */
export const USDAmountSchema = z.object({
  amount: z.number().finite(),
  currency: z.literal("USD"),
  precision: z.number().int().min(0).max(10),
  exchangeRate: z.number().positive().finite(),
  timestamp: z.date(),
});

export type USDAmount = z.infer<typeof USDAmountSchema>;

/**
 * Exchange rate data
 */
export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
  source: string;
}