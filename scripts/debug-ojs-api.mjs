#!/usr/bin/env node
/**
 * OJS API Debugging Script
 * 
 * Traces data from the PHP proxy API across all endpoints to identify
 * where incorrect values originate. Run with:
 * 
 *   node scripts/debug-ojs-api.mjs
 * 
 * Or with a custom URL:
 *   OJS_API_URL="https://submitmanager.com/api/api.php" OJS_API_KEY="<your OJS_API_KEY>" node scripts/debug-ojs-api.mjs
 */

// ─── Configuration ──────────────────────────────────────────────────

const API_URL = process.env.OJS_API_URL || "https://submitmanager.com/api/api.php"
const API_KEY = process.env.OJS_API_KEY
if (!API_KEY) {
    console.error("OJS_API_KEY is not set. Run: OJS_API_KEY='<key>' node scripts/debug-ojs-api.mjs")
    process.exit(1)
}

// ─── Helpers ────────────────────────────────────────────────────────

const RESET = "\x1b[0m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"

function hr(char = "─", len = 80) {
    console.log(DIM + char.repeat(len) + RESET)
}

function heading(text) {
    console.log()
    hr("═")
    console.log(`${BOLD}${CYAN}  ${text}${RESET}`)
    hr("═")
}

function warn(text) { console.log(`${YELLOW}⚠ ${text}${RESET}`) }
function ok(text) { console.log(`${GREEN}✓ ${text}${RESET}`) }
function fail(text) { console.log(`${RED}✗ ${text}${RESET}`) }
function info(text) { console.log(`${DIM}  ${text}${RESET}`) }

function formatValue(val) {
    if (val === null) return `${RED}null${RESET}`
    if (val === undefined) return `${RED}undefined${RESET}`
    if (val === "") return `${YELLOW}(empty string)${RESET}`
    if (typeof val === "string" && val.length > 60) return val.substring(0, 57) + "..."
    return String(val)
}

async function fetchEndpoint(action, params = {}) {
    const url = new URL(API_URL)
    url.searchParams.set("action", action)
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v))
    }

    const start = Date.now()
    try {
        const res = await fetch(url.toString(), {
            headers: { "X-API-KEY": API_KEY, "Accept": "application/json" },
            signal: AbortSignal.timeout(15000),
        })

        const latencyMs = Date.now() - start
        const text = await res.text()
        let json = null
        try { json = JSON.parse(text) } catch { /* not JSON */ }

        return { ok: res.ok, status: res.status, latencyMs, text, json, url: url.toString() }
    } catch (err) {
        return { ok: false, status: 0, latencyMs: Date.now() - start, text: "", json: null, url: url.toString(), error: err.message }
    }
}

// ─── Step 1: Health Check ───────────────────────────────────────────

async function debugHealth() {
    heading("STEP 1: Health Check")
    info(`URL: ${API_URL}`)
    info(`API Key: ${API_KEY ? API_KEY.substring(0, 8) + "..." : "(not set)"}`)

    const result = await fetchEndpoint("health")

    if (result.error) {
        fail(`Connection failed: ${result.error}`)
        return false
    }

    console.log(`  Status: ${result.ok ? GREEN : RED}${result.status}${RESET}`)
    console.log(`  Latency: ${result.latencyMs}ms`)

    if (result.json) {
        ok("Health endpoint responded with JSON")
        console.log(`  Response: ${JSON.stringify(result.json, null, 2)}`)
    } else {
        fail("Health endpoint did NOT return valid JSON")
        console.log(`  Raw response: ${result.text.substring(0, 500)}`)
        return false
    }

    return result.ok
}

// ─── Step 2: Journals List ──────────────────────────────────────────

async function debugJournalsList() {
    heading("STEP 2: Journals List (?action=journals)")

    const result = await fetchEndpoint("journals")

    if (result.error) {
        fail(`Request failed: ${result.error}`)
        return []
    }

    console.log(`  Status: ${result.status} | Latency: ${result.latencyMs}ms`)

    if (!result.json) {
        fail("Did NOT return valid JSON")
        console.log(`  Raw (first 500 chars): ${result.text.substring(0, 500)}`)
        return []
    }

    // Print full raw response
    console.log()
    console.log(`${BOLD}  Raw API Response:${RESET}`)
    console.log(JSON.stringify(result.json, null, 2))
    console.log()

    if (!result.json.success) {
        fail(`API returned success=false: ${result.json.error || "unknown"}`)
        return []
    }

    const journals = result.json.data || []
    ok(`Received ${journals.length} journal(s)`)

    // Print formatted table
    console.log()
    console.log(`${BOLD}  Parsed Journals:${RESET}`)
    hr()
    console.log(
        "  " +
        "ID".padEnd(6) +
        "Name".padEnd(40) +
        "Enabled".padEnd(10) +
        "Thumbnail URL".padEnd(30) +
        "Description"
    )
    hr()

    let missingImages = 0
    let missingDescs = 0
    let missingNames = 0

    for (const j of journals) {
        const id = String(j.journal_id || "?").padEnd(6)
        const name = formatValue(j.name).padEnd(40)
        const enabled = j.enabled ? `${GREEN}true${RESET}` : `${RED}false${RESET}`
        const thumb = j.thumbnail_url ? `${GREEN}✓ set${RESET}` : `${RED}✗ missing${RESET}`
        const desc = j.description ? `${GREEN}✓ set${RESET}` : `${RED}✗ missing${RESET}`

        if (!j.thumbnail_url) missingImages++
        if (!j.description) missingDescs++
        if (!j.name) missingNames++

        console.log(`  ${id}${name}${enabled.padEnd(20)}${thumb.padEnd(40)}${desc}`)
    }

    hr()

    // Print individual thumbnail fields for debugging
    console.log()
    console.log(`${BOLD}  Thumbnail Field Analysis:${RESET}`)
    for (const j of journals) {
        console.log(`  Journal ${j.journal_id} (${j.name || "?"})`)
        console.log(`    thumbnail (raw):     ${formatValue(j.thumbnail)}`)
        console.log(`    thumbnail_url:       ${formatValue(j.thumbnail_url)}`)
        console.log()
    }

    // Summary
    heading("JOURNALS SUMMARY")
    console.log(`  Total Journals Returned:       ${BOLD}${journals.length}${RESET}`)
    console.log(`  Journals Missing Names:        ${missingNames > 0 ? RED : GREEN}${missingNames}${RESET}`)
    console.log(`  Journals Missing Images:       ${missingImages > 0 ? RED : GREEN}${missingImages}${RESET}`)
    console.log(`  Journals Missing Descriptions: ${missingDescs > 0 ? YELLOW : GREEN}${missingDescs}${RESET}`)

    return journals
}

// ─── Step 3: Journal Detail ─────────────────────────────────────────

async function debugJournalDetail(journalId) {
    heading(`STEP 3: Journal Detail (?action=journal&id=${journalId})`)

    const result = await fetchEndpoint("journal", { id: journalId })

    if (result.error) {
        fail(`Request failed: ${result.error}`)
        return
    }

    console.log(`  Status: ${result.status} | Latency: ${result.latencyMs}ms`)

    if (!result.json) {
        fail("Did NOT return valid JSON")
        return
    }

    if (!result.json.success) {
        fail(`API returned success=false: ${result.json.error || "unknown"}`)
        return
    }

    const data = result.json.data

    console.log()
    console.log(`${BOLD}  Journal Detail Fields:${RESET}`)
    hr()

    const fields = [
        ["journal_id", data.journal_id],
        ["path", data.path],
        ["primary_locale", data.primary_locale],
        ["enabled", data.enabled],
        ["current_issue_id", data.current_issue_id],
    ]

    for (const [key, val] of fields) {
        console.log(`  ${key.padEnd(25)} ${formatValue(val)}`)
    }

    console.log()
    console.log(`${BOLD}  Settings (from journal_settings table):${RESET}`)
    hr()

    const settings = data.settings || {}
    const settingKeys = [
        "name", "acronym", "description", "about",
        "contactName", "contactEmail", "publisherInstitution",
        "printIssn", "onlineIssn",
        "journalThumbnail", "homepageImage", "pageHeaderLogoImage",
        "authorGuidelines",
    ]

    for (const key of settingKeys) {
        const val = settings[key]
        const label = key.padEnd(25)
        if (val === undefined) {
            console.log(`  ${label} ${RED}(not in settings)${RESET}`)
        } else {
            console.log(`  ${label} ${formatValue(val)}`)
        }
    }

    // Full raw response for inspection
    console.log()
    console.log(`${BOLD}  Full Raw Response:${RESET}`)
    console.log(JSON.stringify(result.json, null, 2))

    // Sections
    if (data.sections && data.sections.length > 0) {
        console.log()
        console.log(`${BOLD}  Sections (${data.sections.length}):${RESET}`)
        for (const s of data.sections) {
            console.log(`    [${s.section_id}] ${s.title || "(no title)"}`)
        }
    }
}

// ─── Step 4: Stats ──────────────────────────────────────────────────

async function debugStats() {
    heading("STEP 4: Stats (?action=stats)")

    const result = await fetchEndpoint("stats")

    if (result.error) {
        fail(`Request failed: ${result.error}`)
        return
    }

    console.log(`  Status: ${result.status} | Latency: ${result.latencyMs}ms`)

    if (!result.json) {
        fail("Did NOT return valid JSON")
        return
    }

    console.log()
    console.log(`${BOLD}  Raw Stats Response:${RESET}`)
    console.log(JSON.stringify(result.json, null, 2))

    if (result.json.success && result.json.data) {
        const stats = result.json.data
        console.log()
        console.log(`${BOLD}  Stats Breakdown:${RESET}`)
        hr()

        const statFields = [
            ["active_journals", stats.active_journals],
            ["total_submissions", stats.total_submissions],
            ["published_submissions", stats.published_submissions],
            ["queued_submissions", stats.queued_submissions],
            ["declined_submissions", stats.declined_submissions],
            ["published_issues", stats.published_issues],
            ["registered_users", stats.registered_users],
            ["distinct_authors", stats.distinct_authors],
            ["countries_represented", stats.countries_represented],
        ]

        for (const [key, val] of statFields) {
            const color = val === 0 || val === undefined ? RED : GREEN
            console.log(`  ${key.padEnd(28)} ${color}${formatValue(val)}${RESET}`)
        }

        // Check mapping to frontend schema
        console.log()
        console.log(`${BOLD}  Frontend Mapping Check (home-stats schema):${RESET}`)
        hr()
        console.log(`  activeJournals       ← active_journals:       ${formatValue(stats.active_journals)}`)
        console.log(`  publishedArticles    ← published_submissions: ${formatValue(stats.published_submissions)}`)
        console.log(`  researchers          ← distinct_authors:      ${formatValue(stats.distinct_authors)}`)
        console.log(`  countriesEstimated   ← countries_represented: ${formatValue(stats.countries_represented)}`)
    }
}

// ─── Step 5: Node.js API Layer Check ────────────────────────────────

async function debugNodeApi() {
    heading("STEP 5: Node.js API Layer (/api/journals, /api/home-stats)")
    info("These are the internal Next.js API routes that the frontend calls.")
    info("Testing against the production deployment...")

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://digitopub.com"

    // Test /api/journals
    console.log()
    console.log(`${BOLD}  5a. GET ${baseUrl}/api/journals${RESET}`)
    try {
        const res = await fetch(`${baseUrl}/api/journals`, {
            signal: AbortSignal.timeout(15000),
        })
        const json = await res.json()
        console.log(`  Status: ${res.status}`)
        console.log(`  success: ${json.success}`)

        if (json.data && Array.isArray(json.data)) {
            console.log(`  Journals returned: ${json.data.length}`)
            for (const j of json.data) {
                const imgStatus = j.cover_image_url ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
                console.log(`    [${j.id}] ${(j.title || "?").padEnd(40)} img: ${imgStatus}  field: ${j.field || "?"}`)
            }
        } else {
            warn("No data array in response")
            console.log(`  Response: ${JSON.stringify(json, null, 2).substring(0, 500)}`)
        }
    } catch (err) {
        fail(`/api/journals failed: ${err.message}`)
    }

    // Test /api/home-stats
    console.log()
    console.log(`${BOLD}  5b. GET ${baseUrl}/api/home-stats${RESET}`)
    try {
        const res = await fetch(`${baseUrl}/api/home-stats`, {
            signal: AbortSignal.timeout(15000),
        })
        const json = await res.json()
        console.log(`  Status: ${res.status}`)
        console.log(`  Response: ${JSON.stringify(json, null, 2)}`)

        if (json.data) {
            const d = json.data
            const check = (label, val) => {
                const color = val === 0 ? RED : GREEN
                console.log(`    ${label.padEnd(25)} ${color}${val}${RESET}`)
            }
            check("activeJournals", d.activeJournals)
            check("publishedArticles", d.publishedArticles)
            check("researchers", d.researchers)
            check("countriesEstimated", d.countriesEstimated)
        }
    } catch (err) {
        fail(`/api/home-stats failed: ${err.message}`)
    }

    // Test /api/ojs/journals (used by homepage featured section)
    console.log()
    console.log(`${BOLD}  5c. GET ${baseUrl}/api/ojs/journals${RESET}`)
    try {
        const res = await fetch(`${baseUrl}/api/ojs/journals`, {
            signal: AbortSignal.timeout(15000),
        })
        const json = await res.json()
        console.log(`  Status: ${res.status}`)
        console.log(`  configured: ${json.configured}`)

        if (json.data && Array.isArray(json.data)) {
            console.log(`  Journals returned: ${json.data.length}`)
            for (const j of json.data) {
                const thumbStatus = j.thumbnail_url ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
                console.log(`    [${j.journal_id}] ${(j.name || "?").padEnd(40)} thumb: ${thumbStatus}`)
            }
        } else {
            warn("No data array in response")
        }
    } catch (err) {
        fail(`/api/ojs/journals failed: ${err.message}`)
    }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log()
    console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════╗${RESET}`)
    console.log(`${BOLD}${CYAN}║          OJS API Debugging Script — Data Trace Tool             ║${RESET}`)
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════╝${RESET}`)
    console.log()
    info(`Timestamp: ${new Date().toISOString()}`)
    info(`API URL:   ${API_URL}`)
    info(`API Key:   ${API_KEY ? "configured" : "NOT SET"}`)

    // Step 1: Health
    const healthy = await debugHealth()
    if (!healthy) {
        fail("Health check failed. The PHP proxy may not be deployed.")
        warn("Skipping API-level tests. Jumping to Node.js layer...")
        await debugNodeApi()
        return
    }

    // Step 2: Journals list
    const journals = await debugJournalsList()

    // Step 3: Detail for each journal (or first 3)
    const toCheck = journals.slice(0, 3)
    for (const j of toCheck) {
        await debugJournalDetail(j.journal_id)
    }

    // Step 4: Stats
    await debugStats()

    // Step 5: Node.js API layer
    await debugNodeApi()

    // Final summary
    heading("DEBUGGING COMPLETE")
    console.log()
    ok("Review the output above to identify where data inconsistencies originate.")
    info("Look for:")
    info("  - Fields marked in RED (missing/null)")
    info("  - Differences between PHP proxy response and Node.js API response")
    info("  - thumbnail vs thumbnail_url (PHP parses serialized → URL)")
    info("  - Stats values: PHP returns snake_case, frontend expects camelCase")
    console.log()
}

main().catch((err) => {
    console.error(`${RED}Fatal error: ${err.message}${RESET}`)
    process.exit(1)
})
