import { z } from "zod"

export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

// ─── Admin password recovery (#165) ─────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
})

export const resetPasswordSchema = z
  .object({
    // Row id from the emailed link (BigInt as a decimal string).
    id: z.string().regex(/^\d{1,19}$/, "Invalid reset link"),
    token: z.string().min(40, "Invalid reset link").max(128, "Invalid reset link"),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      // bcrypt ignores everything past 72 bytes.
      .refine((p) => new TextEncoder().encode(p).length <= 72, "Password is too long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export const registerSchema = z.object({
  // Personal info (Step 1)
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  country: z.string().min(1, "Country is required").max(90),
  phone: z.string().max(32).optional().or(z.literal("")),
  // Academic info (Step 2)
  affiliation: z.string().min(1, "Affiliation is required").max(255),
  department: z.string().max(255).optional().or(z.literal("")),
  orcid: z.string().optional().or(z.literal("")),
  biography: z.string().max(2000).optional().or(z.literal("")),
  // Role (Step 3)
  primaryRole: z.enum(["author", "reviewer", "editor", "reader"] as const),
  interestedJournalIds: z.array(z.string()).optional(),
  // Agreements (Step 4)
  termsOfService: z.literal(true, { message: "You must accept the Terms of Service" }),
  privacyPolicy: z.literal(true, { message: "You must accept the Privacy Policy" }),
  publishingEthics: z.literal(true, { message: "You must agree to the publishing ethics statement" }),
})

const registerFormBaseSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Confirm password is required"),
  role: z.string().min(1, "Role is required"),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the terms and conditions",
  }),
})

export const registerFormSchema = registerFormBaseSchema.refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormValues = z.infer<typeof registerFormBaseSchema>

export const verifyCodeSchema = z.object({
  email: z.email("Invalid email address"),
  code: z.string().length(6, "Verification code must be exactly 6 digits").regex(/^\d+$/, "Verification code must contain only numbers"),
})

export const resendCodeSchema = z.object({
  email: z.email("Invalid email address"),
})

export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>
export type ResendCodeInput = z.infer<typeof resendCodeSchema>
