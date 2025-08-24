import { assertEquals, assertExists } from "@std/assert";
import { GdprToCcpaConverter, type GDPRRequest, type CCPARequest } from "../../../src/converters/privacy/gdpr-to-ccpa.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("GdprToCcpaConverter", async (t) => {
  const converter = new GdprToCcpaConverter();

  await t.step("should convert GDPR access request to CCPA know request", async () => {
    const input: GDPRRequest = {
      requestType: "access",
      personalDataCategories: ["personal_identifiers", "contact_information"],
      legalBasis: "consent",
      consentGiven: true,
      consentWithdrawable: true,
      dataProcessingPurposes: ["customer_service", "analytics"],
      dataRecipients: ["third_party_processor"],
      crossBorderTransfers: false,
      automatedDecisionMaking: false,
      rightToObject: false,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const ccpa = result.value;
      assertEquals(ccpa.requestType, "know");
      assertEquals(ccpa.categories.identifiers, true);
      assertEquals(ccpa.thirdPartyDisclosure, true);
      assertEquals(ccpa.responseTimeLimit, 45);
      assertEquals(ccpa.verificationRequired, false);
      assertExists(ccpa.originalGDPR);
    }
  });

  await t.step("should convert GDPR erasure to CCPA delete", async () => {
    const input: GDPRRequest = {
      requestType: "erasure",
      personalDataCategories: ["biometric_data", "health_data"],
      legalBasis: "consent",
      consentGiven: false,
      consentWithdrawable: true,
      dataProcessingPurposes: ["identity_verification"],
      crossBorderTransfers: true,
      automatedDecisionMaking: true,
      rightToObject: true,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const ccpa = result.value;
      assertEquals(ccpa.requestType, "delete");
      assertEquals(ccpa.categories.biometricInfo, true);
      assertEquals(ccpa.categories.personalInfoRecords, true);
      assertEquals(ccpa.responseTimeLimit, 45);
      assertEquals(ccpa.verificationRequired, true); // Delete requires verification
    }
  });

  await t.step("should convert GDPR objection to CCPA opt-out", async () => {
    const input: GDPRRequest = {
      requestType: "objection",
      personalDataCategories: ["online_activity", "profile_data"],
      legalBasis: "legitimate_interests",
      consentGiven: true,
      consentWithdrawable: true,
      dataProcessingPurposes: ["marketing", "profiling"],
      dataRecipients: ["advertising_partner"],
      crossBorderTransfers: false,
      automatedDecisionMaking: true,
      rightToObject: true,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const ccpa = result.value;
      assertEquals(ccpa.requestType, "opt_out");
      assertEquals(ccpa.categories.internetActivity, true);
      assertEquals(ccpa.categories.inferences, true);
      assertEquals(ccpa.saleOfPersonalInfo, true); // Legitimate interests + recipients
      assertEquals(ccpa.optOutOfSale, true);
      assertEquals(ccpa.responseTimeLimit, 15); // Faster for opt-out
    }
  });

  await t.step("should map data processing purposes correctly", async () => {
    const input: GDPRRequest = {
      requestType: "access",
      personalDataCategories: ["contact_information"],
      legalBasis: "consent",
      consentGiven: true,
      consentWithdrawable: true,
      dataProcessingPurposes: ["customer_service", "marketing", "analytics", "sales"],
      crossBorderTransfers: false,
      automatedDecisionMaking: false,
      rightToObject: false,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const ccpa = result.value;
      assertEquals(ccpa.businessPurposes.includes("customer_service"), true);
      assertExists(ccpa.commercialPurposes);
      assertEquals(ccpa.commercialPurposes!.includes("marketing"), true);
      assertEquals(ccpa.commercialPurposes!.includes("analytics"), true);
      assertEquals(ccpa.commercialPurposes!.includes("sales"), true);
    }
  });

  await t.step("should handle data retention periods", async () => {
    const input: GDPRRequest = {
      requestType: "access",
      personalDataCategories: ["personal_identifiers"],
      legalBasis: "consent",
      dataRetentionPeriod: 24, // months
      consentGiven: true,
      consentWithdrawable: true,
      dataProcessingPurposes: ["customer_service"],
      crossBorderTransfers: false,
      automatedDecisionMaking: false,
      rightToObject: false,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const ccpa = result.value;
      assertEquals(ccpa.dataRetentionPeriod, 24);
    }
  });

  await t.step("should validate input", async () => {
    const invalidInput = {
      requestType: "invalid_type",
      personalDataCategories: [],
    };

    const result = await converter.convert(invalidInput as any);
    
    assertEquals(Result.isErr(result), true);
  });

  await t.step("should determine sale of personal info correctly", async () => {
    // With legitimate interests and recipients = sale
    const input1: GDPRRequest = {
      requestType: "access",
      personalDataCategories: ["contact_information"],
      legalBasis: "legitimate_interests",
      consentGiven: true,
      consentWithdrawable: true,
      dataProcessingPurposes: ["marketing"],
      dataRecipients: ["partner"],
      crossBorderTransfers: false,
      automatedDecisionMaking: false,
      rightToObject: false,
    };

    const result1 = await converter.convert(input1);
    assertEquals(Result.isOk(result1), true);
    if (Result.isOk(result1)) {
      assertEquals(result1.value.saleOfPersonalInfo, true);
    }

    // With consent basis but still has recipients = no sale (because not legitimate_interests)
    const input2: GDPRRequest = {
      ...input1,
      legalBasis: "consent", // Changed from legitimate_interests
      dataRecipients: ["partner"], // Still has recipients
    };

    const result2 = await converter.convert(input2);
    assertEquals(Result.isOk(result2), true);
    if (Result.isOk(result2)) {
      assertEquals(result2.value.saleOfPersonalInfo, false);
    }
  });

  await t.step("should get all supported request types", () => {
    const gdprTypes = converter.getAllGDPRRequestTypes();
    const ccpaTypes = converter.getAllCCPARequestTypes();
    
    assertEquals(gdprTypes.length, 6);
    assertEquals(gdprTypes.includes("access"), true);
    assertEquals(gdprTypes.includes("erasure"), true);
    
    assertEquals(ccpaTypes.length, 4);
    assertEquals(ccpaTypes.includes("know"), true);
    assertEquals(ccpaTypes.includes("delete"), true);
  });

  await t.step("should check cross-border implications", () => {
    const gdprRequest: GDPRRequest = {
      requestType: "access",
      personalDataCategories: ["contact_information"],
      legalBasis: "consent",
      consentGiven: true,
      consentWithdrawable: true,
      dataProcessingPurposes: ["customer_service"],
      dataRecipients: ["international_partner"],
      crossBorderTransfers: true,
      automatedDecisionMaking: false,
      rightToObject: false,
    };
    
    assertEquals(converter.hasCrossBorderImplications(gdprRequest), true);
  });

  await t.step("should get CCPA category mapping", () => {
    assertEquals(converter.getCCPACategoryMapping("personal_identifiers"), "identifiers");
    assertEquals(converter.getCCPACategoryMapping("biometric_data"), "biometricInfo");
    assertEquals(converter.getCCPACategoryMapping("unknown_category"), undefined);
  });

  await t.step("should handle rectification request", async () => {
    const input: GDPRRequest = {
      requestType: "rectification",
      personalDataCategories: ["contact_information"],
      legalBasis: "contract",
      consentGiven: true,
      consentWithdrawable: false,
      dataProcessingPurposes: ["contract_performance"],
      crossBorderTransfers: false,
      automatedDecisionMaking: false,
      rightToObject: false,
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const ccpa = result.value;
      // CCPA doesn't have rectification, maps to "know"
      assertEquals(ccpa.requestType, "know");
      assertEquals(ccpa.originalGDPR.requestType, "rectification");
    }
  });

  await t.step("should return metadata", () => {
    const metadata = converter.getMetadata();
    
    assertEquals(metadata.name, "GDPR to CCPA Converter");
    assertEquals(metadata.inputType, "GDPRRequest");
    assertEquals(metadata.outputType, "CCPARequest");
    assertExists(metadata.performanceTarget);
  });
});