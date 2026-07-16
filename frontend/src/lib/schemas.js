import { z } from "zod";

const phoneRegex = /^[0-9]{10,15}$/;

export const phoneSchema = z.string().regex(phoneRegex, "Enter 10-15 digits (no spaces)");
export const passwordSchema = z.string().min(6, "Min 6 characters");

export const signInSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
});

export const studentSchema = z.object({
  full_name: z.string().min(2, "Required"),
  phone: phoneSchema,
  fee_amount: z.coerce.number().min(0),
  due_day: z.coerce.number().int().min(1).max(28),
  notes: z.string().optional().nullable(),
});

export const slotSchema = z.object({
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

export const sessionSchema = z.object({
  student_id: z.string().uuid(),
  session_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  kind: z.enum(["regular", "extra", "test"]).default("regular"),
  topic: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const paymentSchema = z.object({
  student_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  payment_date: z.string(),
  method: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
