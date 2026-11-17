import { z } from "zod";

export const emailSchema = z.string().trim().email("Informe um e-mail válido.");
export const passwordSchema = z.string().min(8, "Use pelo menos 8 caracteres.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome completo."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((accepted) => accepted, "Aceite os termos e a política de privacidade para criar sua conta."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export function isValidCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits || /^(\d)\1+$/.test(digits)) return false;
  if (digits.length === 11) {
    const calculateDigit = (slice: string, firstWeight: number) => {
      const remainder = slice.split("").reduce((sum, digit, index) => sum + Number(digit) * (firstWeight - index), 0) % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return calculateDigit(digits.slice(0, 9), 10) === Number(digits[9])
      && calculateDigit(digits.slice(0, 10), 11) === Number(digits[10]);
  }
  if (digits.length === 14) {
    const calculateDigit = (slice: string, weights: number[]) => {
      const remainder = slice.split("").reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const secondWeights = [6, ...firstWeights];
    return calculateDigit(digits.slice(0, 12), firstWeights) === Number(digits[12])
      && calculateDigit(digits.slice(0, 13), secondWeights) === Number(digits[13]);
  }
  return false;
}

export function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

const optionalTaxIdSchema = z.string().trim().optional().refine(
  (value) => !value || isValidCpfCnpj(value),
  "Informe um CPF ou CNPJ válido.",
);

export const partySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  document: optionalTaxIdSchema,
  email: z.union([emailSchema, z.literal("")]).optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome completo."),
  document: z.string().trim().default("").refine(
    (value) => !value || isValidCpfCnpj(value),
    "Informe um CPF ou CNPJ válido.",
  ),
  rg: z.string().trim().default(""),
  marital_status: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  profession: z.string().trim().default(""),
  address: z.string().trim().default(""),
});

export const interviewResponseSchema = z.object({
  contract_type: z.string(),
  conversation_status: z.enum(["collecting", "reviewing", "ready"]),
  extracted_fields: z.record(z.string(), z.unknown()),
  missing_fields: z.array(z.string()),
  validation_warnings: z.array(z.string()),
  next_question: z.string().nullable(),
  requires_confirmation: z.boolean(),
});

export function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);
}
