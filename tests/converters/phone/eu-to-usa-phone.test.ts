import { assertEquals, assertExists } from "@std/assert";
import { EuToUsaPhoneConverter, type EUPhone, type USAPhone } from "../../../src/converters/phone/eu-to-usa-phone.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("EuToUsaPhoneConverter", async (t) => {
  const converter = new EuToUsaPhoneConverter();

  await t.step("should convert UK phone to USA format", async () => {
    const input: EUPhone = {
      countryCode: "+44",
      number: "20 7123 4567",
      type: "landline",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      assertEquals(phone.countryCode, "+1");
      assertEquals(phone.areaCode, "212"); // UK → New York
      assertEquals(phone.exchangeCode, "123");
      assertEquals(phone.lineNumber, "4567");
      assertEquals(phone.type, "landline");
      assertExists(phone.formatted);
      assertExists(phone.e164);
    }
  });

  await t.step("should convert German mobile to USA format", async () => {
    const input: EUPhone = {
      countryCode: "49",
      number: "151 12345678",
      type: "mobile",
      extension: "123",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      assertEquals(phone.countryCode, "+1");
      assertEquals(phone.areaCode, "312"); // Germany → Chicago
      assertEquals(phone.extension, "123");
      assertEquals(phone.type, "mobile");
    }
  });

  await t.step("should handle short phone numbers", async () => {
    const input: EUPhone = {
      countryCode: "+33",
      number: "123",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      assertEquals(phone.areaCode, "310"); // France → LA
      assertEquals(phone.exchangeCode, "123");
      assertEquals(phone.lineNumber, "5555"); // Padded
    }
  });

  await t.step("should handle unknown country codes", async () => {
    const input: EUPhone = {
      countryCode: "+999",
      number: "1234567890",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      assertEquals(phone.areaCode, "212"); // Default to NYC
    }
  });

  await t.step("should format USA phone correctly", async () => {
    const input: EUPhone = {
      countryCode: "+44",
      number: "20 7123 4567",
      extension: "789",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      assertEquals(phone.formatted, "(212) 123-4567 ext. 789");
      assertEquals(phone.e164, "+12121234567");
    }
  });

  await t.step("should format USA phone without extension", async () => {
    const input: EUPhone = {
      countryCode: "+33",
      number: "1 42 86 83 02",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      assertEquals(phone.formatted, "(310) 286-8302");
      assertEquals(phone.e164, "+13102868302");
    }
  });

  await t.step("should validate input", async () => {
    const invalidInput = {
      // Missing required fields
    };

    const result = await converter.convert(invalidInput as any);
    
    assertEquals(Result.isErr(result), true);
  });

  await t.step("should parse EU phone string", () => {
    const phoneString = "+44 20 7123 4567 ext. 123";
    const parsed = converter.parseEUPhone(phoneString);
    
    assertExists(parsed);
    assertEquals(parsed!.countryCode, "44");
    assertEquals(parsed!.number, "20 7123 4567");
    assertEquals(parsed!.extension, "123");
  });

  await t.step("should parse EU phone string without extension", () => {
    const phoneString = "+33 1 42 86 83 02";
    const parsed = converter.parseEUPhone(phoneString);
    
    assertExists(parsed);
    assertEquals(parsed!.countryCode, "33");
    assertEquals(parsed!.number, "1 42 86 83 02");
    assertEquals(parsed!.extension, undefined);
  });

  await t.step("should validate E.164 format", () => {
    assertEquals(converter.isValidE164("+12125551234"), true);
    assertEquals(converter.isValidE164("+1212555123"), false); // Too short
    assertEquals(converter.isValidE164("12125551234"), false); // Missing +
    assertEquals(converter.isValidE164("+44123456789"), false); // Wrong country code
  });

  await t.step("should clean phone numbers correctly", async () => {
    const input: EUPhone = {
      countryCode: "+49",
      number: "(151) 123-45-678",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const phone = result.value;
      // Should clean and use the digits: "15112345678" -> last 7 = "2345678"
      assertEquals(phone.exchangeCode, "234");
      assertEquals(phone.lineNumber, "5678");
    }
  });

  await t.step("should return metadata", () => {
    const metadata = converter.getMetadata();
    
    assertEquals(metadata.name, "EU to USA Phone Converter");
    assertEquals(metadata.inputType, "EUPhone");
    assertEquals(metadata.outputType, "USAPhone");
    assertExists(metadata.performanceTarget);
  });
});