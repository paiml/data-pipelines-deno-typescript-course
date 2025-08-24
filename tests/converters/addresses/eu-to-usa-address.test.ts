import { assertEquals, assertExists } from "@std/assert";
import { EuToUsaAddressConverter, type EUAddress, type USAAddress } from "../../../src/converters/addresses/eu-to-usa-address.ts";
import { Result } from "../../../src/shared/types/result.ts";

Deno.test("EuToUsaAddressConverter", async (t) => {
  const converter = new EuToUsaAddressConverter();

  await t.step("should convert basic EU address to USA format", async () => {
    const input: EUAddress = {
      street: "Hauptstraße 123",
      postalCode: "10115",
      city: "Berlin",
      country: "Germany",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const address = result.value;
      assertEquals(address.streetNumber, "123");
      assertEquals(address.streetName, "HauptStreet"); // "straße" -> "Street"
      assertEquals(address.city, "Berlin");
      assertEquals(address.state, "TX");
      assertEquals(address.zipCode, "10115");
      assertEquals(address.country, "USA");
      assertExists(address.formatted);
    }
  });

  await t.step("should handle French addresses", async () => {
    const input: EUAddress = {
      street: "15 Rue de la Paix",
      postalCode: "75001",
      city: "Paris",
      country: "France",
      apartment: "3B",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const address = result.value;
      assertEquals(address.streetNumber, "15");
      assertEquals(address.streetName, "Street de la Paix");
      assertEquals(address.apartment, "3B");
      assertEquals(address.state, "CA");
      assertEquals(address.zipCode, "75001");
    }
  });

  await t.step("should handle addresses with separate house numbers", async () => {
    const input: EUAddress = {
      street: "Via Roma",
      houseNumber: "42A",
      postalCode: "00186",
      city: "Roma",
      country: "Italy",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const address = result.value;
      assertEquals(address.streetNumber, "42A");
      assertEquals(address.streetName, "Street Roma");
      assertEquals(address.state, "NY");
    }
  });

  await t.step("should handle unknown countries", async () => {
    const input: EUAddress = {
      street: "Test Street 1",
      postalCode: "12345",
      city: "Test City",
      country: "Unknown Country",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const address = result.value;
      assertEquals(address.state, "NY"); // Default state
    }
  });

  await t.step("should convert postal codes correctly", async () => {
    const input: EUAddress = {
      street: "Test Street",
      postalCode: "D-12345-AB",
      city: "Test City",
      country: "Germany",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const address = result.value;
      assertEquals(address.zipCode, "D1234"); // Truncated to 5 chars
    }
  });

  await t.step("should format USA address correctly", async () => {
    const input: EUAddress = {
      street: "Teststraße 42",
      postalCode: "12345",
      city: "Berlin",
      country: "Germany",
      apartment: "5A",
    };

    const result = await converter.convert(input);
    
    assertEquals(Result.isOk(result), true);
    if (Result.isOk(result)) {
      const address = result.value;
      const expectedLine1 = "42 TestStreet, Apt 5A";
      const expectedLine2 = "Berlin, TX 12345";
      assertEquals(address.formatted, `${expectedLine1}\n${expectedLine2}`);
    }
  });

  await t.step("should validate input", async () => {
    const invalidInput = {
      street: "", // Empty street
      city: "Berlin",
      country: "Germany",
    };

    const result = await converter.convert(invalidInput as any);
    
    assertEquals(Result.isErr(result), true);
  });

  await t.step("should parse EU address string", () => {
    const addressString = "Hauptstraße 123\n10115 Berlin\nGermany";
    const parsed = converter.parseEUAddress(addressString);
    
    assertExists(parsed);
    assertEquals(parsed!.street, "Hauptstraße 123");
    assertEquals(parsed!.postalCode, "10115");
    assertEquals(parsed!.city, "Berlin");
    assertEquals(parsed!.country, "Germany");
  });

  await t.step("should return metadata", () => {
    const metadata = converter.getMetadata();
    
    assertEquals(metadata.name, "EU to USA Address Converter");
    assertEquals(metadata.inputType, "EUAddress");
    assertEquals(metadata.outputType, "USAAddress");
    assertExists(metadata.performanceTarget);
  });
});