import { prisma } from "../src/lib/db/config"
import { seedNotificationTemplates } from "../src/features/notifications/server/templates"

const systemTemplates = [
  {
    name: "registration_confirmation",
    subject: "Welcome to {{journal_title}}",
    description: "Sent when an author successfully registers for submitting to a journal.",
    variables: ["author_name", "email", "journal_title"],
    html_content: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5;">
        <h2>Welcome to {{journal_title}}</h2>
        <p>Dear {{author_name}},</p>
        <p>Your registration was successful. You can now submit manuscripts for review.</p>
        <p>Thank you,<br>The Editorial Team</p>
      </div>
    `,
    text_content: "Welcome to {{journal_title}}\n\nDear {{author_name}},\n\nYour registration was successful. You can now submit manuscripts for review.\n\nThank you,\nThe Editorial Team",
    is_active: true,
  },
  {
    name: "submission_received",
    subject: "Submission Received in {{journal_title}} (ID: {{submission_id}})",
    description: "Sent to the author when a new manuscript is successfully submitted.",
    variables: ["author_name", "email", "submission_id", "journal_title", "submission_date"],
    html_content: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5;">
        <h2>Manuscript Received</h2>
        <p>Dear {{author_name}},</p>
        <p>This email confirms that we have received your submission to <strong>{{journal_title}}</strong>.</p>
        <ul>
          <li><strong>Submission ID:</strong> {{submission_id}}</li>
          <li><strong>Date:</strong> {{submission_date}}</li>
        </ul>
        <p>The editorial team will review your submission shortly.</p>
        <p>Thank you,<br>The Editorial Team</p>
      </div>
    `,
    text_content: "Manuscript Received\n\nDear {{author_name}},\n\nThis confirms we have received your submission to {{journal_title}} (ID: {{submission_id}}) on {{submission_date}}.\n\nThank you,\nThe Editorial Team",
    is_active: true,
  },
  {
    name: "review_requested",
    subject: "Review Request: {{journal_title}} (Submission: {{submission_id}})",
    description: "Sent to a reviewer to request a peer review of a manuscript.",
    variables: ["reviewer_name", "email", "submission_id", "journal_title", "due_date"],
    html_content: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5;">
        <h2>Invitation to Review</h2>
        <p>Dear {{reviewer_name}},</p>
        <p>We invite you to review a manuscript (ID: {{submission_id}}) submitted to <strong>{{journal_title}}</strong>.</p>
        <p>If you accept this assignment, the review is requested by: <strong>{{due_date}}</strong>.</p>
        <p>Please log in to the journal management system to view the abstract and respond to this request.</p>
        <p>Sincerely,<br>The Editorial Team</p>
      </div>
    `,
    text_content: "Invitation to Review\n\nDear {{reviewer_name}},\n\nWe invite you to review manuscript ID {{submission_id}} for {{journal_title}}. Requested due date: {{due_date}}.\n\nPlease log in to respond.\n\nSincerely,\nThe Editorial Team",
    is_active: true,
  },
  {
    name: "submission_accepted",
    subject: "Decision on Your Submission to {{journal_title}} (ID: {{submission_id}})",
    description: "Sent to the author when their manuscript is accepted for publication.",
    variables: ["author_name", "email", "submission_id", "journal_title"],
    html_content: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5;">
        <h2>Submission Accepted</h2>
        <p>Dear {{author_name}},</p>
        <p>We are pleased to inform you that your manuscript (ID: {{submission_id}}) has been <strong>accepted</strong> for publication in <strong>{{journal_title}}</strong>.</p>
        <p>The editorial office will contact you regarding the production process.</p>
        <p>Congratulations,<br>The Editorial Team</p>
      </div>
    `,
    text_content: "Submission Accepted\n\nDear {{author_name}},\n\nYour manuscript (ID: {{submission_id}}) has been accepted for publication in {{journal_title}}.\n\nCongratulations,\nThe Editorial Team",
    is_active: true,
  },
  {
    name: "submission_rejected",
    subject: "Decision on Your Submission to {{journal_title}} (ID: {{submission_id}})",
    description: "Sent to the author when their manuscript is declined.",
    variables: ["author_name", "email", "submission_id", "journal_title", "reason"],
    html_content: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5;">
        <h2>Decision regarding your submission</h2>
        <p>Dear {{author_name}},</p>
        <p>We have reached a decision regarding your submission (ID: {{submission_id}}) to <strong>{{journal_title}}</strong>.</p>
        <p>We regret to inform you that we cannot accept the manuscript for publication. {{reason}}</p>
        <p>We appreciate the opportunity to review your work and hope you will consider submitting to us again in the future.</p>
        <p>Sincerely,<br>The Editorial Team</p>
      </div>
    `,
    text_content: "Decision regarding your submission\n\nDear {{author_name}},\n\nWe regret to inform you that your manuscript (ID: {{submission_id}}) cannot be accepted for publication in {{journal_title}} at this time. {{reason}}\n\nSincerely,\nThe Editorial Team",
    is_active: true,
  },
]

async function seed() {
  console.log("Seeding system email templates...")
  
  const errors: Error[] = []

  for (const template of systemTemplates) {
    try {
      await prisma.emailTemplate.upsert({
        where: { name: template.name },
        update: {}, // Don't overwrite if it exists, admins might have customized it
        create: {
          name: template.name,
          subject: template.subject,
          description: template.description,
          html_content: template.html_content,
          text_content: template.text_content,
          variables: template.variables,
          is_active: template.is_active,
        },
      })
      console.log(`✅ Seeded template: ${template.name}`)
    } catch (e: any) {
      console.error(`❌ Failed to seed template: ${template.name}`, e)
      errors.push(new Error(`Template '${template.name}' failed: ${e.message}`))
    }
  }

  if (errors.length > 0) {
    throw new Error(`Seeding failed with ${errors.length} errors.\n` + errors.map(e => e.message).join("\n"))
  }

  // Publication-alert templates (#203). Pass --force to restore edited ones to the shipped version.
  const notify = await seedNotificationTemplates(prisma, { force: process.argv.includes("--force") })
  console.log(`✅ Notification templates: ${notify.created.length} created, ${notify.restored.length} restored, ${notify.kept.length} kept`)

  console.log("Done.")
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
