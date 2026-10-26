<?php
/**
 * OJS User Provisioning Bridge for Digitopub
 *
 * Target Deployment: submitmanager.com (OJS Instance)
 *
 * INSTRUCTIONS:
 * 1. Upload this script (`ojs-user-bridge.php`) to the ROOT directory of the `submitmanager.com` OJS installation.
 *    (It MUST sit next to OJS's `index.php`, `config.inc.php`, and `sso_login.php`).
 * 2. Set the OJS_API_KEY environment variable on BOTH the OJS server and the Next.js server to the same secret.
 * 3. Ensure the server's firewall allows inbound HTTPS requests from the Next.js API host.
 *
 * Security: This script uses Bearer token authentication. All requests must include:
 *   Authorization: Bearer <OJS_API_KEY>
 *
 * @module scripts/ojs-user-bridge
 */

// --- CONFIGURATION ---
$isDev = getenv('APP_ENV') === 'development';
ini_set('display_errors', $isDev ? '1' : '0');
ini_set('display_startup_errors', $isDev ? '1' : '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

// --- OJS Role ID Constants (from PKP\security\Role) ---
define('ROLE_ID_SITE_ADMIN', 1);
define('ROLE_ID_MANAGER', 16);
define('ROLE_ID_SUB_EDITOR', 17);
define('ROLE_ID_ASSISTANT', 4097);
define('ROLE_ID_REVIEWER', 4096);
define('ROLE_ID_AUTHOR', 65536);
define('ROLE_ID_READER', 1048576);

// Map Digitopub roles to OJS role_ids
$ROLE_MAP = [
    'author'   => ROLE_ID_AUTHOR,
    'reviewer' => ROLE_ID_REVIEWER,
    'editor'   => ROLE_ID_SUB_EDITOR,
    'reader'   => ROLE_ID_READER,
];

// --- LOAD OJS CONFIG FOR FALLBACKS ---
$configFile = dirname(__FILE__) . '/config.inc.php';
$config = file_exists($configFile) ? parse_ini_file($configFile, true) : [];

// --- REQUEST VALIDATION ---

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Validate Bearer token
// Fallback priority: getenv() -> $_ENV[] -> config.inc.php [digitopub][api_key]
$apiKey = getenv('OJS_API_KEY') ?: ($_ENV['OJS_API_KEY'] ?? ($config['digitopub']['api_key'] ?? ''));
if (empty($apiKey)) {
    error_log('[OJS-Bridge] FATAL: OJS_API_KEY environment variable (or config value) is not set.');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server misconfiguration: OJS_API_KEY missing']);
    exit;
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (empty($authHeader) || !preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Missing or invalid Authorization header']);
    exit;
}

if (!hash_equals($apiKey, $matches[1])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid API key']);
    exit;
}

// --- PARSE & VALIDATE PAYLOAD ---
$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON payload']);
    exit;
}

// --- ACTION DISPATCH ---
// A payload without "action" is user provisioning, exactly as before. Every
// other action is listed here explicitly and writes one known OJS setting;
// there is deliberately no generic "set any setting" action.
$action = $payload['action'] ?? 'provision_user';

if ($action === 'set_journal_specialization') {
    bridgeSetJournalSpecialization(bridgeConnect($config), $payload);
    exit;
}

if ($action !== 'provision_user') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Unknown action']);
    exit;
}

$email     = trim($payload['email'] ?? '');
$firstName = trim($payload['firstName'] ?? '');
$lastName  = trim($payload['lastName'] ?? '');
$country   = trim($payload['country'] ?? '');
$affiliation = trim($payload['affiliation'] ?? '');
$biography = trim($payload['biography'] ?? '');
$orcid     = trim($payload['orcid'] ?? '');
$password    = $payload['password'] ?? null; // Optional: raw password from registration
$role        = strtolower(trim($payload['primaryRole'] ?? 'author'));
$journalPath = trim($payload['journalPath'] ?? '');

if (empty($email) || empty($firstName) || empty($lastName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields: email, firstName, lastName']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid email address']);
    exit;
}

// --- DATABASE CONNECTION (use extracted config) ---
if (empty($config) || empty($config['database'])) {
    error_log('[OJS-Bridge] FATAL: Failed to parse config.inc.php or [database] section missing.');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'OJS database configuration error']);
    exit;
}

$dbConfig = $config['database'];
$dbHost = $dbConfig['host'] ?? 'localhost';
$dbPort = intval($dbConfig['port'] ?? 3306);
$dbName = $dbConfig['name'] ?? '';
$dbUser = $dbConfig['username'] ?? '';
$dbPass = $dbConfig['password'] ?? '';

try {
    $dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    error_log('[OJS-Bridge] DB connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

// --- CHECK FOR EXISTING USER ---
$stmt = $pdo->prepare('SELECT user_id, username FROM users WHERE email = ?');
$stmt->execute([$email]);
$existingUser = $stmt->fetch();

$userId = null;
$username = '';
$statusCode = 201;
$message = 'User provisioned successfully';

if ($existingUser) {
    // We found an existing user. We must proceed to reconcile their journal roles.
    $userId = (int)$existingUser['user_id'];
    $username = $existingUser['username'];
    $statusCode = 200;
    $message = 'User already exists in OJS, roles reconciled';
} else {
    // --- GENERATE USERNAME ---
    $baseUsername = preg_replace('/[^a-z0-9_]/', '', strtolower(explode('@', $email)[0]));
    $baseUsername = substr($baseUsername, 0, 28); // Leave room for suffix
    if (empty($baseUsername)) {
        $baseUsername = 'user';
    }

    $username = $baseUsername;
    $suffix = 1;
    $stmtCheck = $pdo->prepare('SELECT user_id FROM users WHERE username = ?');
    while (true) {
        $stmtCheck->execute([$username]);
        if (!$stmtCheck->fetch()) break;
        $username = $baseUsername . $suffix;
        $suffix++;
        if ($suffix > 999) {
            $username = $baseUsername . '_' . bin2hex(random_bytes(3));
            break;
        }
    }

    // --- GENERATE PASSWORD HASH ---
    if (!empty($password)) {
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    } else {
        $randomPass = bin2hex(random_bytes(16));
        $passwordHash = password_hash($randomPass, PASSWORD_BCRYPT);
    }

    // --- INSERT USER (TRANSACTION) ---
    try {
        $pdo->beginTransaction();
        $now = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare('
            INSERT INTO users (username, password, email, country, locales, date_registered, date_validated, disabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ');
        $stmt->execute([
            $username,
            $passwordHash,
            $email,
            $country ?: null,
            '["en"]',  // Default locale
            $now,
            $now,      // Mark as validated
        ]);

        $userId = (int)$pdo->lastInsertId();

        // Insert user_settings (localized profile data)
        $locale = 'en';
        $settings = [
            ['givenName', $firstName],
            ['familyName', $lastName],
        ];

        if (!empty($affiliation)) {
            $settings[] = ['affiliation', $affiliation];
        }
        if (!empty($biography)) {
            $settings[] = ['biography', $biography];
        }
        if (!empty($orcid)) {
            $stmtSetting = $pdo->prepare('INSERT INTO user_settings (user_id, locale, setting_name, setting_value) VALUES (?, \'\', ?, ?)');
            $stmtSetting->execute([$userId, 'orcid', $orcid]);
        }

        $stmtSetting = $pdo->prepare('INSERT INTO user_settings (user_id, locale, setting_name, setting_value) VALUES (?, ?, ?, ?)');
        foreach ($settings as [$name, $value]) {
            $stmtSetting->execute([$userId, $locale, $name, $value]);
        }
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($e->getCode() == '23000' && strpos($e->getMessage(), 'Duplicate entry') !== false) {
            // Check if it's the email that was duplicated (concurrent insert)
            $stmtCheck = $pdo->prepare('SELECT user_id, username FROM users WHERE email = ?');
            $stmtCheck->execute([$email]);
            $reUser = $stmtCheck->fetch();
            if ($reUser) {
                // Resolved concurrent insert on email
                $userId = (int)$reUser['user_id'];
                $username = $reUser['username'];
                $statusCode = 200;
                $message = 'User already exists (race condition resolved), roles reconciled';
            } else {
                // Must be a username collision or other duplicate key
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Data collision during provisioning. Please try again.']);
                exit;
            }
        } else {
            error_log('[OJS-Bridge] Insert failed: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to provision user']);
            exit;
        }
    }
}

// --- ASSIGN ROLES ---
// Ensure we resolve the explicit target journal since OJS isolates roles by context.
if (empty($journalPath)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required journalPath parameter to assign roles']);
    exit;
}

$stmtJournal = $pdo->prepare('SELECT journal_id FROM journals WHERE path = ? LIMIT 1');
$stmtJournal->execute([$journalPath]);
$journal = $stmtJournal->fetch();

if (!$journal) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => "Target journal path not found: {$journalPath}"]);
    exit;
}

$contextId = (int)$journal['journal_id'];
$now = date('Y-m-d H:i:s');

if (!isset($ROLE_MAP[$role])) {
    error_log("[OJS-Bridge] WARNING: Unrecognized role '{$role}' requested. Falling back to ROLE_ID_AUTHOR.");
    $targetRoleId = ROLE_ID_AUTHOR;
} else {
    $targetRoleId = $ROLE_MAP[$role];
}
$rolesToAssign = [$targetRoleId];
if ($targetRoleId !== ROLE_ID_READER) {
    $rolesToAssign[] = ROLE_ID_READER;
}

try {
    $pdo->beginTransaction();
    foreach ($rolesToAssign as $roleId) {
        $stmtGroups = $pdo->prepare('
            SELECT user_group_id FROM user_groups
            WHERE role_id = ? AND context_id = ? AND is_default = 1
            LIMIT 1
        ');
        $stmtGroups->execute([$roleId, $contextId]);
        $userGroup = $stmtGroups->fetch();
        
        if (!$userGroup) {
            $stmtGroups = $pdo->prepare('SELECT user_group_id FROM user_groups WHERE role_id = ? AND context_id = ? LIMIT 1');
            $stmtGroups->execute([$roleId, $contextId]);
            $userGroup = $stmtGroups->fetch();
        }
        
        if ($userGroup) {
            $ugId = (int)$userGroup['user_group_id'];
            // Reconcile membership using SELECT 1 to verify existing status
            $stmtCheckMem = $pdo->prepare('SELECT 1 FROM user_user_groups WHERE user_id = ? AND user_group_id = ?');
            $stmtCheckMem->execute([$userId, $ugId]);
            if (!$stmtCheckMem->fetch()) {
                $stmtAssign = $pdo->prepare('INSERT INTO user_user_groups (user_group_id, user_id, date_start) VALUES (?, ?, ?)');
                $stmtAssign->execute([$ugId, $userId, $now]);
            }
        } else {
            error_log("[OJS-Bridge] WARNING: Missing user_group for roleId={$roleId} contextId={$contextId}, skipping assignment for user {$userId}");
        }
    }
    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('[OJS-Bridge] Role assignment failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to assign user roles in context']);
    exit;
}

http_response_code($statusCode);
echo json_encode([
    'success' => true,
    'message' => $message,
    'user_id' => $userId,
    'username' => $username,
]);

// --- ACTION: set_journal_specialization (#234) ---

/**
 * Open a PDO connection from the OJS [database] config, or answer 500 and exit.
 * Same settings as the provisioning connection above.
 */
function bridgeConnect(array $config): PDO
{
    if (empty($config['database'])) {
        error_log('[OJS-Bridge] FATAL: Failed to parse config.inc.php or [database] section missing.');
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'OJS database configuration error']);
        exit;
    }
    $db = $config['database'];
    $host = $db['host'] ?? 'localhost';
    $port = intval($db['port'] ?? 3306);
    $name = $db['name'] ?? '';
    try {
        return new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $db['username'] ?? '', $db['password'] ?? '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[OJS-Bridge] DB connection failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database connection failed']);
        exit;
    }
}

/**
 * Store a journal's specialization, chosen in the digitopub dashboard, as the
 * journal setting `digitopubSpecialization` (locale ''). The digitopub theme
 * declares that property and shows it. An empty value removes the setting.
 *
 * Payload: {"action":"set_journal_specialization","journal_id":10,"value":"Dentistry"}
 * Answer:  {"success":true,"journal_id":10,"before":"General Science","after":"Dentistry"}
 */
function bridgeSetJournalSpecialization(PDO $pdo, array $payload): void
{
    $settingName = 'digitopubSpecialization';
    $journalId = filter_var($payload['journal_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $value = $payload['value'] ?? null;

    if ($journalId === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'journal_id must be a positive integer']);
        return;
    }
    if ($value !== null && !is_string($value)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'value must be a string or null']);
        return;
    }
    $value = $value === null ? '' : trim($value);
    // journal_settings is utf8mb3: no 4-byte characters. No control characters.
    if (mb_strlen($value) > 100 || preg_match('/[\x{10000}-\x{10FFFF}]|\p{Cc}/u', $value) !== 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'value must be at most 100 plain characters']);
        return;
    }

    $stmt = $pdo->prepare('SELECT journal_id FROM journals WHERE journal_id = ?');
    $stmt->execute([$journalId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Journal not found']);
        return;
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("SELECT setting_value FROM journal_settings WHERE journal_id = ? AND locale = '' AND setting_name = ? FOR UPDATE");
        $stmt->execute([$journalId, $settingName]);
        $row = $stmt->fetch();
        $before = $row ? $row['setting_value'] : null;

        if ($value === '') {
            $pdo->prepare("DELETE FROM journal_settings WHERE journal_id = ? AND locale = '' AND setting_name = ?")
                ->execute([$journalId, $settingName]);
        } else {
            $pdo->prepare("INSERT INTO journal_settings (journal_id, locale, setting_name, setting_value) VALUES (?, '', ?, ?)
                           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
                ->execute([$journalId, $settingName, $value]);
        }
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[OJS-Bridge] set_journal_specialization failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save journal specialization']);
        return;
    }

    http_response_code(200);
    // INVALID_UTF8_SUBSTITUTE: a legacy invalid value in `before` must not
    // turn a committed write into an empty 200 (which the caller would retry).
    echo json_encode([
        'success' => true,
        'journal_id' => $journalId,
        'before' => $before,
        'after' => $value === '' ? null : $value,
    ], JSON_INVALID_UTF8_SUBSTITUTE);
}
