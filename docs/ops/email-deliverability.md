# Email deliverability for publication alerts

## Purpose

This runbook describes how to configure the sender mailbox, DNS records, and limits needed before
publication-alert emails are sent. It applies to the notification send queue
(`POST /api/notifications/cron/send`). Read it before setting `NOTIFICATIONS_ENABLED=true` in production.
For the complete click-by-click procedure on Hostinger, without shell access, see
[`notifications-go-live.md`](./notifications-go-live.md).

## Sender mailbox

Create a dedicated mailbox, for example `alerts@digitopub.com`, in hPanel (Emails). Configure the
alerts mailbox through the `NOTIFY_SMTP_*` variables:

- `NOTIFY_SMTP_HOST`, `NOTIFY_SMTP_PORT`, `NOTIFY_SMTP_SECURE`: optional, fall back to `SMTP_*`.
- `NOTIFY_SMTP_USER`, `NOTIFY_SMTP_PASSWORD`, `NOTIFY_SMTP_FROM_EMAIL`: the alerts mailbox credentials.
- `NOTIFY_FROM_NAME`: default display name, `DigitoPub` when unset. Messages about one journal (its issue alerts, invitations for a list assigned to it, messages to its members) show the journal title instead, and an admin can change the name per draft. The address never changes, so SPF, DKIM and DMARC alignment is the same for every name.

Keep OTP and admin mail on the `SMTP_*` mailbox. Bulk alert traffic must not share reputation
with transactional mail.

## Hosting limits

Find the hourly and daily SMTP sending limits for the plan in hPanel (Emails, then the mailbox
or the sending limits panel). Set the throttle to about 80% of those limits:

- `NOTIFY_MAX_PER_HOUR` (default `60`)
- `NOTIFY_MAX_PER_DAY` (default `300`)
- `NOTIFY_MAX_PER_RUN` (default `20`, per cron tick)

The cron never exceeds the hour and day limits. Deliveries beyond them stay queued and are sent
in a later window.

## DNS records

Publish the following records for `digitopub.com`. Verify each one after propagation.

**SPF.** Publish a single TXT record on the root domain. Only one SPF record may exist; merge
any additional senders into this record instead of adding a second one:

```
digitopub.com. TXT "v=spf1 include:_spf.mail.hostinger.com ~all"
```

**DKIM.** Enable DKIM for the domain in hPanel and publish the CNAME or TXT records that hPanel
provides. Do not copy example keys from documentation.

**DMARC.** Publish a TXT record on `_dmarc.digitopub.com`. Start in monitoring mode:

```
_dmarc.digitopub.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@digitopub.com; adkim=s; aspf=s"
```

After 2 to 4 weeks of clean aggregate reports, move to `p=quarantine`. Only move to
`p=reject` after quarantine has run cleanly for a further period.

## Verification

Before enabling sending, confirm all of the following:

- Send a test message to a [mail-tester.com](https://www.mail-tester.com) address with Admin, Notifications,
  Settings, Go-live setup, **Deliverability test**. It uses the alerts mailbox and the real headers. Target a score
  of 9/10 or better.
- Send a test message to a Gmail address, open the message, and choose "Show original".
  The results must show `SPF: PASS`, `DKIM: PASS`, and `DMARC: PASS`.
- The `From` domain matches the SPF and DKIM domains.

## Headers we send

Each alert message carries these headers:

- `List-Unsubscribe`: the https one-click unsubscribe URL. When `NOTIFY_UNSUBSCRIBE_MAILTO` is set,
  a `mailto:` entry is added to the same header.
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Mail clients use it to unsubscribe
  without opening the page.
- `Precedence: bulk`

## Warm-up plan

A new sender mailbox has no reputation. Increase volume gradually:

| Period | Target volume per day |
| --- | --- |
| Week 1 | About 100 |
| Week 2 | About 250 |
| Week 3 | About 500 |
| Week 4 onward | Up to the plan limit (see Hosting limits) |

Watch bounces and complaints every day during warm-up. If the bounce rate exceeds about 5%,
pause the affected campaigns through the admin API and review the subscriber list before resuming.
Do not raise the volume while complaints are rising.

## Bounces

- An SMTP 5xx response marks the subscriber as bounced and suppresses further sends to that address.
- An SMTP 4xx response is retried up to 3 times before the delivery is marked failed.
- Hosting SMTP does not send bounce webhooks. An admin can suppress a subscriber manually in the
  notifications admin area when a bounce or complaint is reported outside the system.

## Enabling checklist

Complete every item before setting `NOTIFICATIONS_ENABLED=true` in production:

- [ ] `NOTIFY_MAX_PER_HOUR` and `NOTIFY_MAX_PER_DAY` are set to about 80% of the hosting plan limits
- [ ] SPF, DKIM, and DMARC records are published and resolve correctly
- [ ] Gmail "Show original" shows SPF, DKIM, and DMARC PASS
- [ ] mail-tester.com score is 9/10 or better
- [ ] Warm-up schedule is planned, and the first week's daily target is set
- [ ] `NOTIFICATIONS_ENABLED=true` is set in the production environment
- [ ] Cron jobs are added on cron-job.org or in hPanel: `*/30 * * * *` (detect), `0 7 * * *` (digests), and `*/5 * * * *` (send)
