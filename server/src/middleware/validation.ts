import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

function validate<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                error: 'Date invalide',
                details: (result.error.issues || []).map((e: any) => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
        }
        req.body = result.data;
        next();
    };
}

export const createTaskSchema = z.object({
    title: z.string().min(1, 'Titlul este obligatoriu').max(255),
    description: z.string().nullable().optional(),
    department_label: z.string().min(1),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD formátum szükséges'),
    assigned_to: z.string().uuid().nullable().optional(),
    parent_id: z.string().uuid().nullable().optional(),
    is_recurring: z.boolean().optional(),
    recurring_interval: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
});

export const updateTaskSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    department_label: z.string().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD formátum szükséges').optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    is_recurring: z.boolean().optional(),
    recurring_interval: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
});

export const changeStatusSchema = z.object({
    status: z.enum(['de_rezolvat', 'in_realizare', 'blocat', 'terminat']),
    reason: z.string().optional(),
});

export const createCommentSchema = z.object({
    content: z.string().min(1, 'Comentariul nu poate fi gol').max(5000),
    mentions: z.array(z.string().uuid()).optional().default([]),
    parent_comment_id: z.string().uuid().nullable().optional().default(null),
});

export const createTemplateSchema = z.object({
    title: z.string().min(1, 'Titlul este obligatoriu').max(255),
    description: z.string().optional(),
    department_label: z.string().min(1),
    assigned_to: z.string().uuid().nullable().optional(),
    subtasks: z.array(z.object({ title: z.string().min(1) })).optional().default([]),
});

export const validateCreateTask = validate(createTaskSchema);
export const validateUpdateTask = validate(updateTaskSchema);
export const validateChangeStatus = validate(changeStatusSchema);
export const validateCreateComment = validate(createCommentSchema);
export const validateCreateTemplate = validate(createTemplateSchema);

// --- Payment schemas ---

const createPaymentBase = z.object({
    title: z.string().min(1, 'Titlul este obligatoriu').max(200),
    amount: z.union([z.number().positive('Suma trebuie să fie pozitivă'), z.string().min(1)]),
    currency: z.string().max(10).default('RON'),
    category: z.enum(['stat', 'partener_furnizor', 'furnizor_servicii', 'furnizor_echipamente', 'marketing', 'salarii', 'incasare_client', 'alte_venituri']),
    beneficiary_name: z.string().max(200).nullable().optional(),
    due_date: z.string().min(1, 'Data scadentă este obligatorie'),
    is_recurring: z.boolean().default(false),
    recurring_frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']).nullable().optional(),
    initial_comment: z.string().max(2000).optional(),
});

export const createPaymentSchema = createPaymentBase.refine(
    (data) => !data.is_recurring || (data.is_recurring && data.recurring_frequency),
    { message: 'Frecvența recurenței este obligatorie pentru plăți recurente', path: ['recurring_frequency'] }
);

export const updatePaymentSchema = createPaymentBase.partial();

export const validateCreatePayment = validate(createPaymentSchema);
export const validateUpdatePayment = validate(updatePaymentSchema);
