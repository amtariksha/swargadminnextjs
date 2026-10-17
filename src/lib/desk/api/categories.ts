// Routes 8 and 9: the category list and the manager's editor. Two plain statements per category
// (update or insert); never an upsert, never a delete (a slug is retired with active:false).

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { z } from 'zod';
import { categoriesPutBody, categoriesQuery } from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import type { Category, DeskContext } from '../types';

type CategoryInput = z.infer<typeof categoriesPutBody>['categories'][number];

const TABLE = 'desk_categories';
const LIST_LIMIT = 500;
const WRITE_BATCH = 5;

export async function listCategories(includeInactive: boolean): Promise<Category[]> {
    let query = supabaseAdmin.from(TABLE).select('*');
    if (!includeInactive) query = query.eq('active', true);
    const { data, error } = await query.order('sort_order').order('slug').limit(LIST_LIMIT);
    dbGuard(error, TABLE);
    return (data ?? []) as Category[];
}

export function readCategories(query: z.infer<typeof categoriesQuery>, ctx: DeskContext): Promise<Category[]> {
    return listCategories(query.all === '1' && ctx.rights.manager);
}

async function existingTypes(slugs: string[]): Promise<Map<string, string>> {
    const { data, error } = await supabaseAdmin.from(TABLE).select('slug, type').in('slug', slugs).limit(LIST_LIMIT);
    dbGuard(error, TABLE);
    return new Map((data ?? []).map((row: { slug: string; type: string }) => [row.slug, row.type]));
}

async function updateCategory(input: CategoryInput): Promise<void> {
    const fields: Partial<CategoryInput> = { ...input };
    delete fields.slug;
    delete fields.type;
    const { error } = await supabaseAdmin.from(TABLE).update(fields).eq('slug', input.slug).select('slug');
    dbGuard(error, TABLE);
}

async function writeCategory(input: CategoryInput, exists: boolean): Promise<void> {
    if (exists) {
        await updateCategory(input);
        return;
    }
    const { error } = await supabaseAdmin.from(TABLE).insert(input).select('slug');
    if (dbGuard(error, TABLE) === 'conflict') await updateCategory(input);
}

export async function putCategories(body: z.infer<typeof categoriesPutBody>): Promise<Category[]> {
    const inputs = body.categories;
    const types = await existingTypes(inputs.map((input) => input.slug));
    const locked = inputs.find((input) => types.has(input.slug) && types.get(input.slug) !== input.type);
    if (locked) {
        throw new DeskApiError('category_type_locked', `${locked.slug}: the type of a category cannot be changed.`);
    }
    for (let start = 0; start < inputs.length; start += WRITE_BATCH) {
        const batch = inputs.slice(start, start + WRITE_BATCH);
        await Promise.all(batch.map((input) => writeCategory(input, types.has(input.slug))));
    }
    return listCategories(true);
}
