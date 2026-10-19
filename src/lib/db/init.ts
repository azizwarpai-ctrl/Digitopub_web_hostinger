import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import bcrypt from 'bcryptjs'

// Keep track of initialization to ensure it only runs once per Node process
let isInitialized = false
let initializationPromise: Promise<void> | null = null

export async function initializeDatabase() {
  // 1. Safe guards
  if (isInitialized) {
    return
  }

  // 2. Strict Production Guard
  if (process.env.ALLOW_PROD_DB_INIT !== 'true') {
    return
  }

  // Prevent parallel initializations in concurrent connections during startup
  if (initializationPromise) {
    console.log('[DB Init] Waiting for existing initialization to complete...')
    return initializationPromise
  }

  initializationPromise = (async () => {
    // Database schema migrations are executed here synchronously to ensure Hostinger applies them
    console.log('[DB Init] Starting runtime database schema migrations (Raw SQL Mode)...')

    // 1. Initialize Prisma Client early so we can run raw SQL migrations
    console.log('[DB Init] Initializing Prisma Client for migrations...')
    const dbUrl = process.env.DATABASE_URL
    let config: Record<string, unknown> = {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
      user: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || '',
      database: process.env.DATABASE_NAME || 'scientific_journals_db',
      connectionLimit: 5,
    }

    if (dbUrl) {
      try {
        const url = new URL(dbUrl)
        config = {
          host: url.hostname,
          port: parseInt(url.port) || 3306,
          user: url.username,
          password: decodeURIComponent(url.password),
          database: url.pathname.substring(1),
          connectionLimit: 5,
        }
      } catch {
        console.warn('[DB Init] Failed to parse DATABASE_URL, falling back to individual env vars')
      }
    }

    const adapter = new PrismaMariaDb(config)
    const prisma = new PrismaClient({ adapter })

    try {
      // --- RAW SQL SCHEMA MIGRATIONS ---
      // Because `prisma migrate deploy` requires `prisma/migrations` files which are not checked into Git,
      // and `prisma db push` cannot be reliably run via PM2/node_modules in a production shell,
      // we execute the missing schema structure explicitly via native Prisma SQL.

      try {
        await prisma.$executeRaw(Prisma.sql`ALTER TABLE \`journals\` ADD COLUMN \`ojs_path\` VARCHAR(100) NULL`)
        console.log('[DB Init] Applied schema patch: Added ojs_path to journals')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        if (!errorMsg.includes('Duplicate column name')) {
          console.error('[DB Init] Failed to add ojs_path column:', errorMsg)
        }
      }

      try {
        await prisma.$executeRaw(Prisma.sql`
          CREATE TABLE IF NOT EXISTS \`ojs_sso_tokens\` (
            \`id\` VARCHAR(191) NOT NULL,
            \`token\` VARCHAR(128) NOT NULL,
            \`email\` VARCHAR(255) NOT NULL,
            \`expires_at\` DATETIME(3) NOT NULL,
            \`used\` BOOLEAN NOT NULL DEFAULT false,
            \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE INDEX \`ojs_sso_tokens_token_key\`(\`token\`),
            INDEX \`ojs_sso_tokens_token_idx\`(\`token\`),
            INDEX \`ojs_sso_tokens_email_idx\`(\`email\`),
            PRIMARY KEY (\`id\`)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `)
        console.log('[DB Init] Applied schema patch: Synchronized ojs_sso_tokens table')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to create ojs_sso_tokens table:', errorMsg)
      }

      try {
        await prisma.$executeRaw(Prisma.sql`
          CREATE TABLE IF NOT EXISTS \`verification_codes\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`user_id\` BIGINT NOT NULL,
            \`email\` VARCHAR(255) NOT NULL,
            \`code\` VARCHAR(72) NOT NULL,
            \`expires_at\` DATETIME(3) NOT NULL,
            \`used\` BOOLEAN NOT NULL DEFAULT false,
            \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            \`attempts\` INT NOT NULL DEFAULT 0,
            \`last_failed_at\` DATETIME(3) NULL,
            \`locked_until\` DATETIME(3) NULL,
            INDEX \`verification_codes_email_idx\`(\`email\`),
            INDEX \`verification_codes_code_idx\`(\`code\`),
            PRIMARY KEY (\`id\`)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `)
        console.log('[DB Init] Applied schema patch: Synchronized verification_codes table')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to create verification_codes table:', errorMsg)
      }

      // Admin password-reset links (#165); mirrors migration 20261019120000.
      try {
        await prisma.$executeRaw(Prisma.sql`
          CREATE TABLE IF NOT EXISTS \`password_reset_tokens\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`user_id\` BIGINT NOT NULL,
            \`token_hash\` VARCHAR(72) NOT NULL,
            \`expires_at\` DATETIME(3) NOT NULL,
            \`used_at\` DATETIME(3) NULL,
            \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX \`password_reset_tokens_user_id_idx\`(\`user_id\`),
            INDEX \`password_reset_tokens_expires_at_idx\`(\`expires_at\`),
            PRIMARY KEY (\`id\`),
            CONSTRAINT \`password_reset_tokens_user_id_fkey\` FOREIGN KEY (\`user_id\`)
              REFERENCES \`admin_users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `)
        console.log('[DB Init] Applied schema patch: Synchronized password_reset_tokens table')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to create password_reset_tokens table:', errorMsg)
      }

      try {
        await prisma.$executeRaw(
          Prisma.sql`ALTER TABLE \`verification_codes\` MODIFY COLUMN \`code\` VARCHAR(72) NOT NULL`
        )
        console.log('[DB Init] Applied schema patch: Widened verification_codes.code to VARCHAR(72)')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to widen verification_codes.code column:', errorMsg)
      }

      // --- Patch: Add OJS extended profile columns to admin_users ---
      // DDL identifiers/types can't be driver-bound, so each statement is a
      // fully static Prisma.sql template (no interpolation) rather than a
      // string built from a variable — keeps the column name for logging.
      const profileColumns: Array<{ name: string; sql: Prisma.Sql }> = [
        { name: 'country', sql: Prisma.sql`ALTER TABLE \`admin_users\` ADD COLUMN \`country\` VARCHAR(90) NULL` },
        { name: 'phone', sql: Prisma.sql`ALTER TABLE \`admin_users\` ADD COLUMN \`phone\` VARCHAR(32) NULL` },
        { name: 'affiliation', sql: Prisma.sql`ALTER TABLE \`admin_users\` ADD COLUMN \`affiliation\` VARCHAR(255) NULL` },
        { name: 'department', sql: Prisma.sql`ALTER TABLE \`admin_users\` ADD COLUMN \`department\` VARCHAR(255) NULL` },
        { name: 'orcid', sql: Prisma.sql`ALTER TABLE \`admin_users\` ADD COLUMN \`orcid\` VARCHAR(255) NULL` },
        { name: 'biography', sql: Prisma.sql`ALTER TABLE \`admin_users\` ADD COLUMN \`biography\` TEXT NULL` },
      ]

      for (const col of profileColumns) {
        try {
          await prisma.$executeRaw(col.sql)
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e)
          if (!errorMsg.includes('Duplicate column name')) {
            console.error(`[DB Init] Failed to add ${col.name} column:`, errorMsg)
          }
        }
      }
      console.log('[DB Init] Applied schema patch: Synchronized admin_users profile columns')
      
      try {
        await prisma.$executeRaw(Prisma.sql`ALTER TABLE \`about_sections\` ADD COLUMN \`section_key\` VARCHAR(50) NULL UNIQUE`)
        console.log('[DB Init] Applied schema patch: Added section_key to about_sections')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        if (!errorMsg.includes('Duplicate column name')) {
          console.error('[DB Init] Failed to add section_key column:', errorMsg)
        }
      }

      try {
        await prisma.$executeRaw(Prisma.sql`
          CREATE TABLE IF NOT EXISTS \`article_audio\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`ojs_journal_id\` VARCHAR(50) NOT NULL,
            \`submission_id\` BIGINT NOT NULL,
            \`locale\` VARCHAR(14) NOT NULL DEFAULT '',
            \`storage_key\` VARCHAR(500) NOT NULL,
            \`mime_type\` VARCHAR(100) NOT NULL,
            \`size_bytes\` BIGINT NOT NULL,
            \`original_filename\` VARCHAR(255) NOT NULL,
            \`duration_seconds\` INTEGER NULL,
            \`uploaded_by\` BIGINT NOT NULL,
            \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            \`updated_at\` DATETIME(3) NOT NULL,
            INDEX \`article_audio_ojs_journal_id_submission_id_idx\`(\`ojs_journal_id\`, \`submission_id\`),
            INDEX \`article_audio_uploaded_by_idx\`(\`uploaded_by\`),
            UNIQUE INDEX \`uq_article_audio_journal_submission_locale\`(\`ojs_journal_id\`, \`submission_id\`, \`locale\`),
            PRIMARY KEY (\`id\`)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `)
        console.log('[DB Init] Applied schema patch: Synchronized article_audio table')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to create article_audio table:', errorMsg)
      }

      try {
        await prisma.$executeRaw(Prisma.sql`
          ALTER TABLE \`article_audio\`
            ADD CONSTRAINT \`article_audio_uploaded_by_fkey\`
            FOREIGN KEY (\`uploaded_by\`) REFERENCES \`admin_users\`(\`id\`)
            ON DELETE RESTRICT ON UPDATE CASCADE;
        `)
        console.log('[DB Init] Applied schema patch: Added article_audio FK to admin_users')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        if (!errorMsg.includes('Duplicate') && !errorMsg.includes('already exists')) {
          console.error('[DB Init] Failed to add article_audio FK:', errorMsg)
        }
      }

      // --- Patch: email_templates + email_logs ---
      // These models predate the runtime-patch mechanism; prod DBs that were
      // seeded before the migration existed are missing the tables, so the
      // Email Templates page 500s (`table email_templates does not exist`).
      // Create both here (templates first — email_logs has an FK to it),
      // mirroring model EmailTemplate / EmailLog in schema.prisma. Idempotent.
      try {
        await prisma.$executeRaw(Prisma.sql`
          CREATE TABLE IF NOT EXISTS \`email_templates\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`name\` VARCHAR(100) NOT NULL,
            \`subject\` VARCHAR(500) NOT NULL,
            \`html_content\` LONGTEXT NOT NULL,
            \`text_content\` LONGTEXT NULL,
            \`variables\` JSON NULL,
            \`description\` TEXT NULL,
            \`is_active\` BOOLEAN NOT NULL DEFAULT true,
            \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            UNIQUE INDEX \`email_templates_name_key\`(\`name\`),
            INDEX \`email_templates_is_active_idx\`(\`is_active\`),
            INDEX \`email_templates_name_idx\`(\`name\`),
            PRIMARY KEY (\`id\`)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `)
        console.log('[DB Init] Applied schema patch: Synchronized email_templates table')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to create email_templates table:', errorMsg)
      }

      try {
        await prisma.$executeRaw(Prisma.sql`
          CREATE TABLE IF NOT EXISTS \`email_logs\` (
            \`id\` BIGINT NOT NULL AUTO_INCREMENT,
            \`template_id\` BIGINT NULL,
            \`to_email\` VARCHAR(255) NOT NULL,
            \`subject\` VARCHAR(500) NOT NULL,
            \`status\` VARCHAR(50) NOT NULL DEFAULT 'pending',
            \`error_message\` TEXT NULL,
            \`sent_at\` DATETIME(3) NULL,
            \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX \`email_logs_template_id_idx\`(\`template_id\`),
            INDEX \`email_logs_status_idx\`(\`status\`),
            INDEX \`email_logs_to_email_idx\`(\`to_email\`),
            PRIMARY KEY (\`id\`)
          ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `)
        console.log('[DB Init] Applied schema patch: Synchronized email_logs table')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[DB Init] Failed to create email_logs table:', errorMsg)
      }

      try {
        await prisma.$executeRaw(Prisma.sql`
          ALTER TABLE \`email_logs\`
            ADD CONSTRAINT \`email_logs_template_id_fkey\`
            FOREIGN KEY (\`template_id\`) REFERENCES \`email_templates\`(\`id\`)
            ON DELETE SET NULL ON UPDATE CASCADE;
        `)
        console.log('[DB Init] Applied schema patch: Added email_logs FK to email_templates')
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        if (!errorMsg.includes('Duplicate') && !errorMsg.includes('already exists')) {
          console.error('[DB Init] Failed to add email_logs FK:', errorMsg)
        }
      }

      // --- END MIGRATIONS ---

      console.log('[DB Init] Starting runtime database seeding...')

      const maskEmail = (email: string) => {
        const [name, domain] = email.split('@')
        if (!domain) return email
        return `${name.charAt(0)}${'*'.repeat(5)}@${domain}`
      }

      const adminEmail = process.env.ADMIN_EMAIL
      const adminPasswordRaw = process.env.ADMIN_PASSWORD
      const supportEmail = process.env.SUPPORT_EMAIL
      const supportPasswordRaw = process.env.SUPPORT_PASSWORD

      if (!adminEmail || !adminPasswordRaw || !supportEmail || !supportPasswordRaw) {
        throw new Error('[DB Init] CRITICAL: Missing required seed credentials.')
      }

      console.log(`[DB Init] Ensuring privileged accounts exist (create-if-absent)...`)

      // Create-if-absent for Super Admin — never overwrite an existing
      // account so that passwords rotated via the admin UI persist.
      const adminHash = await bcrypt.hash(adminPasswordRaw, 10)
      await prisma.adminUser.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
          email: adminEmail,
          password_hash: adminHash,
          full_name: 'Super Administrator',
          role: 'super_admin',
        }
      })
      console.log(`[DB Init] Super Admin (${maskEmail(adminEmail)}) synchronized.`)

      // Create-if-absent for Support User
      const supportHash = await bcrypt.hash(supportPasswordRaw, 10)
      await prisma.adminUser.upsert({
        where: { email: supportEmail },
        update: {},
        create: {
          email: supportEmail,
          password_hash: supportHash,
          full_name: 'Technical Support',
          role: 'admin',
        }
      })
      console.log(`[DB Init] Support User (${maskEmail(supportEmail)}) synchronized.`)

      // Idempotent per-key settings seeding
      const defaultSettings = [
        { key: 'site_name', value: 'DigitoPub Scientific Journals', desc: 'The name of the platform' },
        { key: 'contact_email', value: 'support@digstobob.com', desc: 'Primary contact email' }
      ]

      console.log('[DB Init] ⚙️ Synchronizing system settings...')
      for (const setting of defaultSettings) {
        await prisma.systemSetting.upsert({
          where: { setting_key: setting.key },
          update: {}, // Don't overwrite existing values if key exists
          create: {
            setting_key: setting.key,
            setting_value: JSON.stringify(setting.value),
            description: setting.desc
          }
        })
      }

      // Foundation CMS Content: About Page (Idempotent)
      // Canonical contract — keys MUST match app/about/page.tsx and app/admin/about/page.tsx:
      //   who_we_are, vision, goals
      console.log('[DB Init] 📝 Initializing About Page baseline structure...')

      // One-time cleanup of deprecated keys from earlier seeds. Safe: these rows
      // only exist as prior factory defaults and never matched the public page.
      try {
        const removed = await prisma.aboutSection.deleteMany({
          where: { section_key: { in: ['mission_vision', 'our_mission', 'our_vision'] } }
        })
        if (removed.count > 0) {
          console.log(`[DB Init] 🧹 Removed ${removed.count} legacy About rows (mission_vision/our_mission/our_vision).`)
        }
      } catch (e) {
        console.error('[DB Init] Legacy About cleanup failed:', e instanceof Error ? e.message : String(e))
      }

      const aboutContent: Array<{
        section_key: string
        block_type: string
        title: string
        subtitle: string | null
        content: string | null
        display_order: number
      }> = [
        {
          section_key: 'who_we_are',
          block_type: 'TEXT',
          title: 'Who We Are',
          subtitle: null,
          content: 'DigitoPub is the official publishing house and platform of Digitodontics International Academy. At DigitoPub, we redefine the future of academic publishing through seamless digital integration and innovation. As a forward-thinking scientific publisher, we provide a comprehensive suite of digital publishing and management solutions designed to empower journals, editors, and researchers worldwide.\n\nOur services include e-journal platform solutions for journal creation, hosting, and management; SubmitManager, our intuitive e-submission platform; and end-to-end e-editorial and e-review systems that streamline every stage of scholarly communication.\n\nBeyond these core services, we offer CrossRef integration (DOI, Crossmark, Similarity Check), XML, PDF, and LaTeX production, ORCID author identification, citation metrics, indexing, and archiving solutions through Portico and CLOCKSS, ensuring every publication meets the highest international standards of accessibility and integrity.',
          display_order: 10,
        },
        {
          section_key: 'vision',
          block_type: 'TEXT',
          title: 'Our Vision',
          subtitle: null,
          content: 'To create a vibrant ecosystem where science and technology evolve in harmony, fostering a trusted environment where scholarly work can thrive. We envision a future where every researcher has access to world-class publishing tools, transparent peer review, and global reach — regardless of geography, institution, or discipline.',
          display_order: 20,
        },
        {
          // Note: section_key "goals" is the canonical identifier (used in app/about/page.tsx lookup
          // and app/admin/about/page.tsx dropdown), but the title and content describe "Our Mission".
          // This alias is intentional for backward compatibility with the admin UI contract.
          section_key: 'goals',
          block_type: 'TEXT',
          title: 'Our Mission',
          subtitle: null,
          content: 'To empower journals, editors, and researchers worldwide with comprehensive digital publishing solutions that uphold the highest standards of transparency, quality, and ethical scholarly communication. We bridge the gap between research creation, dissemination, and long-term preservation — so that every discovery reaches the people who need it.',
          display_order: 30,
        },
      ]

      for (const section of aboutContent) {
        await prisma.aboutSection.upsert({
          where: { section_key: section.section_key },
          update: {}, // Strict rule: never override what an Admin has tuned in the future
          create: {
            section_key: section.section_key,
            block_type: section.block_type,
            title: section.title,
            subtitle: section.subtitle,
            content: section.content,
            display_order: section.display_order,
            is_active: true,
          }
        })
      }

      // Help Centre: baseline categories for the four footer "Resources" links
      // (Guide for Authors, Guide for Reviewers, Publication Ethics, FAQ).
      // These are admin-editable via /admin/help-content; seeds are idempotent
      // and never overwrite edits an admin has made after the first run.
      //
      // Content provenance:
      //   - Guide for Authors / Guide for Reviewers topics come verbatim from
      //     the previous `scripts/seed-help-articles.ts` + the pre-refactor
      //     `help-schema.ts` defaults (git commit 5c84b35).
      //   - Publication Ethics / FAQ topics are drafted to reflect the
      //     platform's OJS-backed workflow, COPE alignment, and core services
      //     (DOI/Crossref, ORCID, Portico/CLOCKSS). Admins can edit or extend
      //     via the dashboard; the first seed leaves them immutable after.
      console.log('[DB Init] 📚 Initializing Help Centre baseline categories...')

      const helpSeed: Array<{
        slug: string
        title: string
        topics: Array<{ title: string; content: string; order: number }>
      }> = [
        {
          slug: 'guide-for-authors',
          title: 'Guide for Authors',
          topics: [
            {
              title: 'Manuscript Preparation',
              content:
                "Ensure your manuscript adheres to the journal's formatting guidelines, including citation style, figure resolution, and word count limits. Use the templates provided if available.",
              order: 1,
            },
            {
              title: 'Submission Process',
              content:
                'Verify that all co-authors are listed correctly and that you have obtained necessary ethical approvals. Prepare a cover letter to the editor highlighting the significance of your work.',
              order: 2,
            },
            {
              title: 'Revision & Resubmission',
              content:
                "When submitting a revised manuscript, include a point-by-point response to the reviewers' comments. Highlight changes in the manuscript text for easy verification.",
              order: 3,
            },
          ],
        },
        {
          slug: 'guide-for-reviewers',
          title: 'Guide for Reviewers',
          topics: [
            {
              title: 'The Review Process',
              content:
                "Reviews should be constructive, objective, and timely. Evaluate the study's methodology, clarity, and contribution to the field. Maintain confidentiality throughout the process.",
              order: 1,
            },
            {
              title: 'Writing Reviews',
              content:
                'Provide specific comments and suggestions for improvement. Clearly state your recommendation (Accept, Minor Revision, Major Revision, Reject) to the editor.',
              order: 2,
            },
            {
              title: 'Timeline & Expectations',
              content:
                'Accept review invitations only if you have the expertise and time to complete the review within the deadline. Inform the editor immediately if a conflict of interest or delay arises.',
              order: 3,
            },
          ],
        },
        {
          slug: 'publication-ethics',
          title: 'Publication Ethics',
          topics: [
            {
              title: 'Authorship & Contribution',
              content:
                'All listed authors must have made substantial contributions to the conception, design, execution, or interpretation of the reported study. Ghost, gift, and guest authorship are not permitted. Any change to the author list after submission requires written consent from all authors and editorial approval.',
              order: 1,
            },
            {
              title: 'Originality & Plagiarism',
              content:
                "Submitted manuscripts must be the authors' original work and not under consideration elsewhere. All submissions are screened through similarity-detection tools (Crossref Similarity Check / iThenticate). Plagiarism, self-plagiarism, and duplicate publication are grounds for immediate rejection or retraction.",
              order: 2,
            },
            {
              title: 'Conflicts of Interest',
              content:
                'Authors, reviewers, and editors must disclose any financial, personal, or professional relationships that could be perceived as influencing the work. Undisclosed conflicts discovered post-publication may trigger a correction or retraction.',
              order: 3,
            },
            {
              title: 'Research Integrity & Data Availability',
              content:
                'Data fabrication, falsification, and selective reporting are serious forms of misconduct. Authors should retain raw data and, where applicable, deposit it in a recognised public repository. Editors may request underlying data at any stage of review.',
              order: 4,
            },
            {
              title: 'Ethical Approval & Informed Consent',
              content:
                'Studies involving human participants must cite approval from an institutional review board (IRB) or equivalent, together with a statement confirming informed consent. Animal studies must comply with recognised guidelines (e.g. ARRIVE) and declare ethical oversight.',
              order: 5,
            },
            {
              title: 'Corrections, Retractions & Misconduct',
              content:
                'We follow COPE guidelines for handling suspected misconduct, errors, and disputes. Confirmed errors are addressed through corrigenda, expressions of concern, or retractions, and all post-publication notices are linked to the original article via Crossmark.',
              order: 6,
            },
          ],
        },
        {
          slug: 'faq',
          title: 'FAQ',
          topics: [
            {
              title: 'How do I submit a manuscript?',
              content:
                'Submissions are handled through SubmitManager, our integrated e-submission platform. From any journal page, click "Submit Manuscript" — new authors are provisioned an account automatically and returning authors go straight to their dashboard.',
              order: 1,
            },
            {
              title: 'Do I need an account on DigitoPub to submit?',
              content:
                'No separate DigitoPub account is required. Author identities and submissions live on SubmitManager; DigitoPub simply routes you there securely.',
              order: 2,
            },
            {
              title: 'How long does the peer review process take?',
              content:
                'Typical first-decision times range from 4 to 8 weeks, depending on the journal and reviewer availability. You can track the current status of your submission at any time from your SubmitManager dashboard.',
              order: 3,
            },
            {
              title: 'Are there article processing charges (APCs)?',
              content:
                "APC policies vary per journal. Each journal's specific fees, waiver policy, and funding options are listed on its individual page under \"Author Guidelines.\"",
              order: 4,
            },
            {
              title: 'How are DOIs assigned to published articles?',
              content:
                'Every accepted article receives a persistent DOI registered with Crossref at the time of publication. Crossmark is enabled so readers are notified of any subsequent corrections or updates.',
              order: 5,
            },
            {
              title: 'Why do you recommend an ORCID iD?',
              content:
                'ORCID provides a unique, persistent identifier that disambiguates your authorship across journals and databases. We collect ORCID iDs at submission so your publications are reliably linked to your scholarly record.',
              order: 6,
            },
            {
              title: 'How do I volunteer as a reviewer?',
              content:
                "Contact the journal's editorial office directly — contact details are on each journal's page — or indicate your interest through your SubmitManager profile. Editors invite reviewers based on subject expertise and prior review history.",
              order: 7,
            },
            {
              title: 'How is long-term access to my article guaranteed?',
              content:
                'All journals hosted by DigitoPub are archived with Portico and CLOCKSS, ensuring permanent access even if a journal ceases publication. Content is also indexed with major discovery services where eligible.',
              order: 8,
            },
          ],
        },
      ]

      for (const seed of helpSeed) {
        const category = await prisma.helpCategory.upsert({
          where: { slug: seed.slug },
          update: {}, // Never overwrite admin edits after first run
          create: {
            slug: seed.slug,
            title: seed.title,
          },
        })

        // HelpTopic has no unique composite key, so upsert by (category_id, title)
        // via findFirst + conditional create. Existing topics are left alone
        // regardless of content drift — the admin is the source of truth after
        // the first seed.
        for (const topic of seed.topics) {
          const existing = await prisma.helpTopic.findFirst({
            where: { category_id: category.id, title: topic.title },
            select: { id: true },
          })
          if (!existing) {
            await prisma.helpTopic.create({
              data: {
                category_id: category.id,
                title: topic.title,
                content: topic.content,
                order: topic.order,
                is_active: true,
              },
            })
          }
        }
      }

      console.log('[DB Init] ✅ Database initialization completed successfully.')
      isInitialized = true
    } catch (error) {
      console.error('[DB Init] ❌ Initialization process failed:', error)
      initializationPromise = null // Allow retry if it failed
      throw error
    } finally {
      await prisma.$disconnect()
    }
  })()

  return initializationPromise
}
