import { describe, it, expect } from 'vitest'
import { journalCreateSchema, journalUpdateSchema, journalIdParamSchema } from '@/src/features/journals/schemas/journal-schema'

describe('Journal Schemas', () => {
    // ═══════════════════════════════════════
    // journalCreateSchema
    // ═══════════════════════════════════════
    describe('journalCreateSchema', () => {
        const validJournal = {
            title: 'International Journal of Computer Science',
            field: 'Computer Science',
        }

        it('should accept valid journal with required fields only', () => {
            const result = journalCreateSchema.safeParse(validJournal)
            expect(result.success).toBe(true)
        })

        it('should accept journal with all fields', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                abbreviation: 'IJCS',
                issn: '2708-5001',
                e_issn: '2708-501X',
                description: 'A great journal',
                publisher: 'DigitoPub Press',
                editor_in_chief: 'Dr. Smith',
                frequency: 'Quarterly',
                submission_fee: 25,
                publication_fee: 150,
                cover_image_url: 'https://example.com/cover.jpg',
                website_url: 'https://example.com/journal',
                status: 'active',
            })
            expect(result.success).toBe(true)
        })

        it('should reject empty title', () => {
            const result = journalCreateSchema.safeParse({
                title: '',
                field: 'CS',
            })
            expect(result.success).toBe(false)
        })

        it('should reject empty field', () => {
            const result = journalCreateSchema.safeParse({
                title: 'Some Journal',
                field: '',
            })
            expect(result.success).toBe(false)
        })

        it('should reject title exceeding 500 chars', () => {
            const result = journalCreateSchema.safeParse({
                title: 'X'.repeat(501),
                field: 'CS',
            })
            expect(result.success).toBe(false)
        })

        it('should reject negative submission_fee', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                submission_fee: -10,
            })
            expect(result.success).toBe(false)
        })

        it('should reject negative publication_fee', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                publication_fee: -50,
            })
            expect(result.success).toBe(false)
        })

        it('should reject invalid website_url', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                website_url: 'not-a-url',
            })
            expect(result.success).toBe(false)
        })

        it('should reject invalid cover_image_url', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                cover_image_url: 'not-a-url',
            })
            expect(result.success).toBe(false)
        })

        it('should reject invalid status value', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                status: 'unknown_status',
            })
            expect(result.success).toBe(false)
        })

        it('should accept all valid status values', () => {
            for (const status of ['active', 'inactive', 'suspended']) {
                const result = journalCreateSchema.safeParse({ ...validJournal, status })
                expect(result.success).toBe(true)
            }
        })

        it('should default submission_fee to 0', () => {
            const result = journalCreateSchema.safeParse(validJournal)
            if (result.success) {
                expect(result.data.submission_fee).toBe(0)
            }
        })

        it('should default status to active', () => {
            const result = journalCreateSchema.safeParse(validJournal)
            if (result.success) {
                expect(result.data.status).toBe('active')
            }
        })

        it('should coerce string submission_fee to number', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                submission_fee: '25',
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.submission_fee).toBe(25)
            }
        })

        it('should allow null optional fields', () => {
            const result = journalCreateSchema.safeParse({
                ...validJournal,
                abbreviation: null,
                issn: null,
                description: null,
            })
            expect(result.success).toBe(true)
        })
    })

    // ═══════════════════════════════════════
    // journalUpdateSchema (partial)
    // ═══════════════════════════════════════
    describe('journalUpdateSchema', () => {
        it('should accept partial update (title only)', () => {
            const result = journalUpdateSchema.safeParse({
                title: 'Updated Title',
            })
            expect(result.success).toBe(true)
        })

        it('should accept empty object (no changes)', () => {
            const result = journalUpdateSchema.safeParse({})
            expect(result.success).toBe(true)
        })

        it('should reject invalid field values in partial update', () => {
            const result = journalUpdateSchema.safeParse({
                submission_fee: -5,
            })
            expect(result.success).toBe(false)
        })

        // #234: a partial update must never inject create-time defaults, or a
        // title-only PATCH would reset both fees to 0 and status to "active".
        it('should not inject defaults for omitted keys', () => {
            const result = journalUpdateSchema.parse({ title: 'Updated Title' })
            expect(result).toEqual({ title: 'Updated Title' })
        })

        // #234: field changes go through PUT /journals/:id/specialization so
        // they are validated against the managed list and synced to OJS.
        it('should strip field', () => {
            const result = journalUpdateSchema.parse({ field: 'Dentistry', title: 'T' })
            expect(result).toEqual({ title: 'T' })
        })
    })

    // ═══════════════════════════════════════
    // journalIdParamSchema
    // ═══════════════════════════════════════
    describe('journalIdParamSchema', () => {
        it('should accept numeric string ID', () => {
            const result = journalIdParamSchema.safeParse({ id: '123' })
            expect(result.success).toBe(true)
        })

        it('should reject non-numeric string', () => {
            const result = journalIdParamSchema.safeParse({ id: 'abc' })
            expect(result.success).toBe(false)
        })

        it('should reject empty string', () => {
            const result = journalIdParamSchema.safeParse({ id: '' })
            expect(result.success).toBe(false)
        })

        it('should accept large numeric ID', () => {
            const result = journalIdParamSchema.safeParse({ id: '999999999' })
            expect(result.success).toBe(true)
        })

        it('should reject string with spaces', () => {
            const result = journalIdParamSchema.safeParse({ id: '12 3' })
            expect(result.success).toBe(false)
        })
    })
})
