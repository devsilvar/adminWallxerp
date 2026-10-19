import { z } from 'zod';
import { paginationSchema } from './admin.validator';

export const createBroadcastSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title too long (max 200)'),
  body: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message too long (max 5000)'),
  audience: z.discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({ type: z.literal('user'), userId: z.string().uuid('User ID must be a valid UUID') }),
  ]),
});

export const listBroadcastsSchema = paginationSchema.extend({
  search: z.string().trim().optional().nullable(),
});

export const listMessagesSchema = paginationSchema.extend({
  unread: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
});

export const markReadSchema = z.object({
  id: z.string().uuid('Message ID must be a valid UUID'),
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type ListBroadcastsQuery = z.infer<typeof listBroadcastsSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
