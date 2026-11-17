import { describe, expect, it } from "vitest";
import { formatCpfCnpj, formatCurrency, isValidCpfCnpj, loginSchema, partySchema, registerSchema } from "./validators";

describe("form validation", () => {
  it("requires a valid email and a non-empty password for login", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "pass" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "user@example.com", password: "pass" }).success).toBe(true);
  });

  it("rejects account registration when passwords differ", () => {
    expect(registerSchema.safeParse({
      name: "Ana da Silva",
      email: "ana@example.com",
      password: "password-123",
      confirmPassword: "different-456",
      acceptTerms: true,
    }).success).toBe(false);
  });

  it("requires explicit acceptance of the terms and privacy policy", () => {
    const registration = {
      name: "Ana da Silva",
      email: "ana@example.com",
      password: "password-123",
      confirmPassword: "password-123",
    };
    expect(registerSchema.safeParse(registration).success).toBe(false);
    expect(registerSchema.safeParse({ ...registration, acceptTerms: true }).success).toBe(true);
  });

  it("allows optional contact details on a frequent party", () => {
    expect(partySchema.safeParse({ name: "Pessoa Exemplo" }).success).toBe(true);
    expect(partySchema.safeParse({ name: "Pessoa Exemplo", email: "invalid" }).success).toBe(false);
  });

  it("validates and formats Brazilian CPF and CNPJ values", () => {
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
    expect(isValidCpfCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidCpfCnpj("111.111.111-11")).toBe(false);
    expect(formatCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(partySchema.safeParse({ name: "Pessoa Exemplo", document: "123.456.789-00" }).success).toBe(false);
  });

  it("formats amounts using the Brazilian real locale", () => {
    expect(formatCurrency(15000)).toBe("R$\u00a015.000,00");
  });
});
