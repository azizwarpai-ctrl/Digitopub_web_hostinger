# Publication alerts: go-live runbook (Hostinger, no shell needed)

This is the complete, ordered procedure for turning on publication alerts (epic #204) in
production. Every step is done in a web browser: **hPanel**, a free **cron-job.org** account,
**mail-tester.com** and the DigitoPub admin. You never need to run a command on the server.

| What | Kind of change | Where |
| --- | --- | --- |
| Environment variables | App configuration | hPanel, Node.js app settings |
| Starter data (disciplines, rules, templates) | Database content | DigitoPub admin, one button |
| Three scheduled jobs | External scheduler | cron-job.org |
| SPF, DKIM, DMARC | Domain DNS (not env vars) | hPanel, DNS zone |
| mail-tester score of 9/10 or better | A check, not a setting | DigitoPub admin, then mail-tester.com |
| `NOTIFICATIONS_ENABLED=true` | App configuration, set last | hPanel, Node.js app settings |

Nothing is ever emailed without an admin approving a draft, even after the switch is on.

The menu names in hPanel shift a little between versions. If a label below does not match
exactly, look for the nearest equivalent.

---

## Step 1. Merge and deploy

Merge the PRs into `main` in this order: #205, #206, #207, #208, #209, #210, #211, #212.
Each PR is stacked on the previous one.

Hostinger rebuilds the site after the merge. The build runs `prisma migrate deploy` itself, so
**the database migrations need no action**. The migrations only add new tables and one new column.

## Step 2. The sending mailbox

Alerts are sent from the existing, already configured mailbox **`noreply@digitopub.com`**. You
need its password, from hPanel, **Emails**, `digitopub.com`, for Step 3. If you do not know the
password, reset it there, then update `SMTP_PASSWORD` too, because OTP and admin mail use the
same mailbox.

Alerts and OTP/admin mail share this mailbox's reputation and sending limits. Keep the alert
limits in Step 3 low enough to leave room for OTP codes. If complaints ever rise, move alerts to a
dedicated mailbox by changing only the `NOTIFY_SMTP_*` values.

Optionally create `unsubscribe@digitopub.com`, as a mailbox or an alias. Mail clients use it for
"mailto" unsubscribes.

While you are in Emails, look up the plan's **sending limits** (emails per hour and per day). Your
plan details or Hostinger support can tell you. You need them in Step 3.

## Step 3. Set the environment variables

In hPanel, open **Websites**, then `digitopub.com`, then the **Node.js** app settings, then
**Environment variables**. Add or change these, then **Save** and **Redeploy**.

### Secrets you generate yourself

Generate each secret on **your own computer** and paste the result. Run this in Windows
PowerShell (Start menu, type "PowerShell"):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString("x2") })
```

Each run prints 64 random hexadecimal characters. Run it once per secret, and never reuse one
value for two variables.

| Variable | Value | Notes |
| --- | --- | --- |
| `NOTIFY_TOKEN_SECRET` | 64 hex characters (generated) | **Required.** Signs the confirm, manage and unsubscribe links. If you change it later, every link already emailed stops working. |
| `CRON_SECRET` | 64 hex characters (generated) | **Required.** The scheduler sends it in Step 5. If it is already set, keep the existing value. |
| `EVENT_IP_HASH_SALT_SEED` | 64 hex characters (generated) | Keep the existing value if it is already set. |

### Values you copy

| Variable | Value | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://digitopub.com` | Your site address, with no trailing slash. All email links use it. |
| `NOTIFY_SMTP_HOST` | `smtp.hostinger.com` | hPanel, Emails, the mailbox, "Connect apps and devices" (SMTP settings) |
| `NOTIFY_SMTP_PORT` | `465` | Same panel |
| `NOTIFY_SMTP_SECURE` | `true` | `true` for port 465 (SSL) |
| `NOTIFY_SMTP_USER` | `noreply@digitopub.com` | The mailbox from Step 2 |
| `NOTIFY_SMTP_PASSWORD` | the mailbox password | Set in Step 2 |
| `NOTIFY_SMTP_FROM_EMAIL` | `noreply@digitopub.com` | Must be the same mailbox, or SPF and DMARC alignment fails |
| `NOTIFY_FROM_NAME` | `DigitoPub` | Default display name in the inbox. Journal messages show the journal title automatically; the address stays the same. |
| `NOTIFY_UNSUBSCRIBE_MAILTO` | `unsubscribe@digitopub.com` | Optional. Leave it unset if you skipped that mailbox. |
| `NOTIFY_MAX_PER_HOUR` | about 80% of the plan's hourly limit, minus your usual OTP/admin volume | From Step 2. The default is `60`. |
| `NOTIFY_MAX_PER_DAY` | about 80% of the plan's daily limit | From Step 2. The default is `300`. During warm-up, use the week's target (see `email-deliverability.md`). |
| `NOTIFY_MAX_PER_RUN` | `20` | Emails per 5-minute tick. Keep it at or below `NOTIFY_MAX_PER_HOUR` divided by 12. |
| `NOTIFICATIONS_ENABLED` | `false` | **Keep it false for now.** It is switched on in Step 8. |

Leave the existing `SMTP_*` variables alone. They keep sending OTP codes and admin mail.

## Step 4. Install starter data and fill in settings

Sign in to the DigitoPub admin, then open **Notifications**, then **Settings**:

1. In **Settings**, enter the publisher **postal address**. It is required in every email footer
   (anti-spam law). Choose the weekly digest day, then click Save.
2. In **Go-live setup**, click **Install starter data**. This adds the starter discipline list, the
   global rules and the seven email templates. It is safe to click again, because existing
   entries and your edits are kept. This button replaces the `seed-notifications.ts` and
   `seed-email-templates.ts` scripts.

The **Go-live setup** checklist at the top of the page shows what is still missing. Use it to
check every remaining step.

## Step 5. Create the three scheduled jobs (cron-job.org)

The Hostinger server has no user crontab, so an external scheduler calls three protected URLs.
**cron-job.org** is free and supports the required header.

1. Create an account at <https://cron-job.org>, open **Settings** and set the **time zone to UTC**.
2. Create three cron jobs with **Create cronjob**:

   | Title | URL | Schedule (UTC) |
   | --- | --- | --- |
   | DigitoPub detect | `https://digitopub.com/api/notifications/cron/detect` | Every 30 minutes |
   | DigitoPub digests | `https://digitopub.com/api/notifications/cron/digests` | Every day at 07:00 |
   | DigitoPub send | `https://digitopub.com/api/notifications/cron/send` | Every 5 minutes |

3. In each job, open the **Advanced** tab:
   - **Request method:** `POST`
   - **Headers:** add one header with key `Authorization` and value `Bearer ` followed by your
     `CRON_SECRET`. The value has one space after "Bearer".
   - **Timeout:** the maximum offered.
4. Save, then use **Test run** on each job. While `NOTIFICATIONS_ENABLED=false` the expected answer
   is **200** with `"skipped": true`. That still proves the URL and secret work.
   - **401** means the header or secret is wrong.
   - **429** means a previous run still holds the lock. An occasional 429 is harmless.
   - **207** later means "more work, continuing on the next run". It is a success.
5. Refresh the admin **Go-live setup** card. All three cron rows should show a recent "Last run".

If you also want the existing jobs (OJS sync, metrics) on the same scheduler, they are listed in
[`cron-schedule.md`](./cron-schedule.md) and set up the same way. `/api/ojs/sync` uses `GET`.

**Alternative to cron-job.org:** in hPanel, open **Advanced**, then **Cron Jobs**, choose
**Custom**, and enter the `curl` command from `cron-schedule.md` (for example
`curl -fsS -X POST -H "Authorization: Bearer YOUR_SECRET" https://digitopub.com/api/notifications/cron/send`).
Use it only if hPanel accepts the header. The secret is then stored in hPanel.

## Step 6. DNS: SPF, DKIM, DMARC

These records belong to the **domain**, not the app. Open hPanel, then **Domains**,
`digitopub.com`, **DNS / Nameservers**, **DNS records**.

- **SPF:** find the existing `TXT` record on `@` that starts with `v=spf1`. **Edit it. Do not add a
  second one**, because a domain may have only one SPF record. It must contain
  `include:_spf.mail.hostinger.com`, for example:
  `v=spf1 include:_spf.mail.hostinger.com ~all`.
  If other services also send for the domain, keep their `include:` entries in the same record.
- **DKIM:** open hPanel, then **Emails**, then **DNS settings** (or "Email authentication"). If the
  domain uses Hostinger nameservers, DKIM is usually added already and shows as active. Otherwise,
  copy the `CNAME` or `TXT` records shown there exactly into the DNS zone.
- **DMARC:** add a `TXT` record with name `_dmarc` and value
  `v=DMARC1; p=none; rua=mailto:dmarc@digitopub.com; adkim=s; aspf=s`.
  Create a `dmarc@` mailbox or alias to receive the reports. Move to `p=quarantine` after 2 to 4
  clean weeks, as described in [`email-deliverability.md`](./email-deliverability.md).

DNS changes can take from a few minutes up to 24 hours to propagate. Check them with a public
lookup tool such as <https://mxtoolbox.com/SuperTool.aspx> (SPF, DKIM and DMARC lookups).

## Step 7. Deliverability test (target 9/10 or better)

1. Open <https://www.mail-tester.com> and copy the address it shows.
2. In the admin, open **Notifications**, **Settings**, **Go-live setup**, **Deliverability test**.
   Paste the address and click **Send test**.
   - The test is a sample new-issue alert sent through the **sending mailbox** (`noreply@`), with the same
     unsubscribe headers as real alerts. It works while sending is still disabled.
   - You can add several addresses at once (for example mail-tester, a Gmail and an Outlook inbox). Test emails
     are limited to 50 per hour in total.
3. Back on mail-tester.com, click **Then check your score**.
4. Send one more test to a Gmail address. In Gmail, open the message, then the three-dot menu,
   then **Show original**. It must show `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.

Common mail-tester deductions and their fixes:

| mail-tester says | Fix |
| --- | --- |
| SPF fails or "not authorised" | Step 6 SPF record missing, duplicated, or without the Hostinger include |
| DKIM missing or invalid | Step 6 DKIM records not published or not propagated yet |
| DMARC missing | Add the `_dmarc` TXT record |
| From domain does not match | `NOTIFY_SMTP_FROM_EMAIL` must equal `NOTIFY_SMTP_USER` on `@digitopub.com` |
| Blacklisted IP | Rare on Hostinger's shared servers; ask Hostinger support for a clean sending IP |
| Missing List-Unsubscribe | Should not happen (sent automatically); confirm PR #209 is deployed |
| Broken or localhost links | `NEXT_PUBLIC_APP_URL` is not `https://digitopub.com` |

Repeat until the score is **9/10 or better**.

## Step 8. Switch on

When every row of the **Go-live setup** checklist is ready except the last one:

1. In hPanel, set `NOTIFICATIONS_ENABLED=true`, then Save and **Redeploy**.
2. Within 30 minutes the detect job runs for the first time. It only records "now" as its starting
   point, so **the back catalogue is never emailed**.
3. From then on, new issues and articles become **draft campaigns**. Admins get a "draft ready"
   email. Open **Notifications**, then **Campaigns**, preview the draft, send yourself a test,
   then **Approve**. Only approved campaigns are sent, a few per 5-minute tick, within your limits.
4. Follow the warm-up schedule in [`email-deliverability.md`](./email-deliverability.md), and watch
   bounces daily for the first weeks.

## Rollback

Set `NOTIFICATIONS_ENABLED=false` and Redeploy. All three jobs immediately become no-ops. Queued
emails stay queued and resume when the switch goes back on. You can also **Pause** or **Cancel**
a single campaign from its admin page.

---

## After go-live: journal messaging (epic #219)

These features need no setup beyond the migrations, which the Hostinger build applies itself.

- **Sender name.** Alerts show **DigitoPub** as the sender (`NOTIFY_FROM_NAME`). Issue alerts, invitations for a
  list assigned to a journal, and messages to a journal's members show that **journal's title** instead. The
  sending address is always the same mailbox, so SPF, DKIM and DMARC are unaffected. Each draft has a
  **Sender name** field to change it.
- **Assigning an uploaded list.** On the import's Confirm step, choose **General** or one journal. People from a
  journal list follow that journal once they accept the invitation, which is sent in the journal's name.
  People who were already subscribed are not changed.
- **Inviting a journal's authors.** **Imports → Import authors from OJS** reads that journal's authors from
  SubmitManager (read only) and opens the usual review. Only authors who accept the invitation receive
  anything after it.
- **New message.** **Campaigns → New message** writes to everyone, a journal's members, one uploaded list or
  hand-picked people. Only confirmed subscribers are included. It creates a draft: send a test, then approve.
- **Editing content.** On any draft, **Edit content** changes the HTML and plain text. Then:
  **Save for this message only**, **Save as new template…**, or **Overwrite template…** (changes every future
  email that uses it). The unsubscribe link, manage link and postal address cannot be removed.
- **Testing with several addresses.** Every **Send test** box (campaign drafts, the template editor and the
  deliverability test) accepts up to 10 addresses, separated by commas or new lines. Save your usual review group
  under **Settings → Test recipients** to pre-fill the boxes. All test emails share a budget of 50 per hour,
  because they use the same mailbox as OTP codes and real alerts.
- After deploying this, click **Install starter data** once more (Settings → Go-live setup) to add the new
  **notify_custom_message** letter template. The checklist shows "7 of 8 installed" until then. Your edited
  templates are kept.
