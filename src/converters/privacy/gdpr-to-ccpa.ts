import {
  Converter,
  ConverterConfig,
  ConverterMetadata,
  ConversionError,
  ErrorCode,
  Result,
} from "../../shared/types/index.ts";
import { z } from "zod";

/**
 * GDPR data subject request schema
 */
export const GDPRRequestSchema = z.object({
  requestType: z.enum(["access", "rectification", "erasure", "portability", "restriction", "objection"]),
  personalDataCategories: z.array(z.string()),
  legalBasis: z.enum(["consent", "contract", "legal_obligation", "vital_interests", "public_task", "legitimate_interests"]),
  dataRetentionPeriod: z.number().optional(), // months
  consentGiven: z.boolean(),
  consentWithdrawable: z.boolean(),
  dataProcessingPurposes: z.array(z.string()),
  dataRecipients: z.array(z.string()).optional(),
  crossBorderTransfers: z.boolean(),
  automatedDecisionMaking: z.boolean(),
  rightToObject: z.boolean(),
  dataProtectionOfficer: z.string().optional(),
});

export type GDPRRequest = z.infer<typeof GDPRRequestSchema>;

/**
 * CCPA consumer request schema
 */
export const CCPARequestSchema = z.object({
  requestType: z.enum(["know", "delete", "opt_out", "non_discrimination"]),
  personalInfoCategories: z.array(z.string()),
  businessPurposes: z.array(z.string()),
  commercialPurposes: z.array(z.string()).optional(),
  thirdPartyDisclosure: z.boolean(),
  saleOfPersonalInfo: z.boolean(),
  optOutOfSale: z.boolean(),
  dataRetentionPeriod: z.number().optional(), // months
  verificationRequired: z.boolean(),
  responseTimeLimit: z.number(), // days
  categories: z.object({
    identifiers: z.boolean(),
    personalInfoRecords: z.boolean(),
    protectedClassifications: z.boolean(),
    commercialInfo: z.boolean(),
    biometricInfo: z.boolean(),
    internetActivity: z.boolean(),
    geolocationData: z.boolean(),
    audioVisualInfo: z.boolean(),
    professionalInfo: z.boolean(),
    educationInfo: z.boolean(),
    inferences: z.boolean(),
  }),
  originalGDPR: z.object({
    requestType: z.string(),
    legalBasis: z.string(),
    consentGiven: z.boolean(),
  }),
});

export type CCPARequest = z.infer<typeof CCPARequestSchema>;

/**
 * GDPR to CCPA request type mapping
 */
const GDPR_TO_CCPA_REQUEST_MAPPING: Record<string, string> = {
  "access": "know",
  "rectification": "know", // CCPA doesn't have direct rectification
  "erasure": "delete",
  "portability": "know",
  "restriction": "opt_out",
  "objection": "opt_out",
};

/**
 * GDPR data categories to CCPA categories mapping
 */
const GDPR_TO_CCPA_CATEGORIES: Record<string, keyof CCPARequest["categories"]> = {
  "personal_identifiers": "identifiers",
  "contact_information": "identifiers",
  "financial_information": "commercialInfo",
  "biometric_data": "biometricInfo",
  "location_data": "geolocationData",
  "online_activity": "internetActivity",
  "audio_visual_data": "audioVisualInfo",
  "employment_data": "professionalInfo",
  "education_data": "educationInfo",
  "profile_data": "inferences",
  "health_data": "personalInfoRecords",
  "demographic_data": "protectedClassifications",
};

/**
 * Converts GDPR requests to CCPA format
 */
export class GdprToCcpaConverter implements Converter<GDPRRequest, CCPARequest> {
  /**
   * Convert GDPR request to CCPA format
   */
  async convert(
    input: GDPRRequest,
    config?: ConverterConfig,
  ): Promise<Result<CCPARequest, ConversionError>> {
    try {
      // Validate input if not skipped
      if (!config?.skipValidation && !this.validate(input)) {
        return Result.err(
          new ConversionError(
            "Invalid GDPR request format",
            ErrorCode.INVALID_INPUT,
            { input },
          ),
        );
      }

      // Map request type
      const requestType = this.mapRequestType(input.requestType);
      
      // Map personal data categories to CCPA categories
      const categories = this.mapDataCategories(input.personalDataCategories);
      
      // Map processing purposes to business/commercial purposes
      const { businessPurposes, commercialPurposes } = this.mapProcessingPurposes(
        input.dataProcessingPurposes
      );
      
      // Determine CCPA-specific settings
      const saleOfPersonalInfo = this.determineSaleOfPersonalInfo(input);
      const optOutOfSale = this.determineOptOutOfSale(input);
      const responseTimeLimit = this.getResponseTimeLimit(requestType);
      const verificationRequired = this.requiresVerification(requestType);

      const result: CCPARequest = {
        requestType,
        personalInfoCategories: this.mapPersonalInfoCategories(input.personalDataCategories),
        businessPurposes,
        commercialPurposes,
        thirdPartyDisclosure: input.dataRecipients ? input.dataRecipients.length > 0 : false,
        saleOfPersonalInfo,
        optOutOfSale,
        dataRetentionPeriod: input.dataRetentionPeriod,
        verificationRequired,
        responseTimeLimit,
        categories,
        originalGDPR: {
          requestType: input.requestType,
          legalBasis: input.legalBasis,
          consentGiven: input.consentGiven,
        },
      };

      return Result.ok(result);
    } catch (error) {
      return Result.err(
        new ConversionError(
          `Privacy compliance conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ErrorCode.CONVERSION_FAILED,
          { input, error },
          false,
        ),
      );
    }
  }

  /**
   * Validate input is a valid GDPR request
   */
  validate(input: unknown): input is GDPRRequest {
    const result = GDPRRequestSchema.safeParse(input);
    return result.success;
  }

  /**
   * Get converter metadata
   */
  getMetadata(): ConverterMetadata {
    return {
      name: "GDPR to CCPA Converter",
      version: "1.0.0",
      inputType: "GDPRRequest",
      outputType: "CCPARequest",
      description: "Converts GDPR privacy requests to CCPA format",
      performanceTarget: {
        p50: 8,
        p95: 15,
        p99: 25,
      },
    };
  }

  /**
   * Map GDPR request type to CCPA
   */
  private mapRequestType(gdprType: string): "know" | "delete" | "opt_out" | "non_discrimination" {
    const mapped = GDPR_TO_CCPA_REQUEST_MAPPING[gdprType];
    return (mapped as "know" | "delete" | "opt_out") || "know";
  }

  /**
   * Map GDPR data categories to CCPA categories object
   */
  private mapDataCategories(gdprCategories: string[]): CCPARequest["categories"] {
    const categories: CCPARequest["categories"] = {
      identifiers: false,
      personalInfoRecords: false,
      protectedClassifications: false,
      commercialInfo: false,
      biometricInfo: false,
      internetActivity: false,
      geolocationData: false,
      audioVisualInfo: false,
      professionalInfo: false,
      educationInfo: false,
      inferences: false,
    };

    for (const gdprCategory of gdprCategories) {
      const ccpaCategory = GDPR_TO_CCPA_CATEGORIES[gdprCategory];
      if (ccpaCategory) {
        categories[ccpaCategory] = true;
      }
    }

    return categories;
  }

  /**
   * Map personal data categories to CCPA personal info categories
   */
  private mapPersonalInfoCategories(gdprCategories: string[]): string[] {
    return gdprCategories.map(category => {
      // Convert GDPR category names to CCPA equivalents
      return category
        .replace("personal_", "")
        .replace("_data", "")
        .replace("_information", "")
        .replace("_", " ");
    });
  }

  /**
   * Map GDPR processing purposes to business/commercial purposes
   */
  private mapProcessingPurposes(purposes: string[]): {
    businessPurposes: string[];
    commercialPurposes?: string[];
  } {
    const businessPurposes: string[] = [];
    const commercialPurposes: string[] = [];

    for (const purpose of purposes) {
      if (this.isCommercialPurpose(purpose)) {
        commercialPurposes.push(purpose);
      } else {
        businessPurposes.push(purpose);
      }
    }

    return {
      businessPurposes,
      commercialPurposes: commercialPurposes.length > 0 ? commercialPurposes : undefined,
    };
  }

  /**
   * Determine if a purpose is commercial
   */
  private isCommercialPurpose(purpose: string): boolean {
    const commercialKeywords = [
      "marketing", "advertising", "sales", "promotion",
      "targeting", "profiling", "analytics", "monetization"
    ];
    
    return commercialKeywords.some(keyword => 
      purpose.toLowerCase().includes(keyword)
    );
  }

  /**
   * Determine if personal info is sold (for CCPA)
   */
  private determineSaleOfPersonalInfo(gdpr: GDPRRequest): boolean {
    // CCPA considers sharing for commercial purposes as "sale"
    return gdpr.dataRecipients && gdpr.dataRecipients.length > 0 && 
           gdpr.legalBasis === "legitimate_interests";
  }

  /**
   * Determine opt-out status based on GDPR consent
   */
  private determineOptOutOfSale(gdpr: GDPRRequest): boolean {
    return !gdpr.consentGiven || 
           gdpr.requestType === "objection" || 
           gdpr.requestType === "restriction";
  }

  /**
   * Get CCPA response time limit based on request type
   */
  private getResponseTimeLimit(requestType: string): number {
    // CCPA response times
    switch (requestType) {
      case "delete":
        return 45; // days
      case "know":
        return 45; // days
      case "opt_out":
        return 15; // days
      default:
        return 45; // days
    }
  }

  /**
   * Determine if verification is required
   */
  private requiresVerification(requestType: string): boolean {
    // Delete requests always require verification
    return requestType === "delete";
  }

  /**
   * Get all supported GDPR request types
   */
  getAllGDPRRequestTypes(): string[] {
    return ["access", "rectification", "erasure", "portability", "restriction", "objection"];
  }

  /**
   * Get all supported CCPA request types
   */
  getAllCCPARequestTypes(): string[] {
    return ["know", "delete", "opt_out", "non_discrimination"];
  }

  /**
   * Check if GDPR request has cross-border implications for CCPA
   */
  hasCrossBorderImplications(gdpr: GDPRRequest): boolean {
    return gdpr.crossBorderTransfers && gdpr.dataRecipients !== undefined;
  }

  /**
   * Get CCPA category mapping for a GDPR category
   */
  getCCPACategoryMapping(gdprCategory: string): string | undefined {
    return GDPR_TO_CCPA_CATEGORIES[gdprCategory];
  }
}