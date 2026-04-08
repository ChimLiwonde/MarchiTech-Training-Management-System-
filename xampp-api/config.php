<?php

$parseBoolean = static function (string|false $value, bool $fallback = false): bool {
    if ($value === false || trim($value) === '') {
        return $fallback;
    }

    return !in_array(strtolower(trim($value)), ['0', 'false', 'no', 'off'], true);
};

$config = [
    'db' => [
        'host' => getenv('MARCHITECH_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('MARCHITECH_DB_PORT') ?: '3306',
        'database' => getenv('MARCHITECH_DB_NAME') ?: 'marchitech_training',
        'username' => getenv('MARCHITECH_DB_USER') ?: 'root',
        'password' => getenv('MARCHITECH_DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],
    'cors' => [
        'allowed_origins' => array_values(array_filter(array_map(
            'trim',
            explode(
                ',',
                getenv('MARCHITECH_ALLOWED_ORIGINS')
                    ?: 'http://localhost:8080,http://127.0.0.1:8080,http://localhost'
            )
        ))),
    ],
    'payments' => [
        'enabled' => $parseBoolean(getenv('MARCHITECH_PAYMENTS_ENABLED'), false),
        'provider' => 'paychangu',
        'paychangu' => [
            'payment_url' => getenv('MARCHITECH_PAYCHANGU_PAYMENT_URL') ?: 'https://api.paychangu.com/payment',
            'verify_url' => getenv('MARCHITECH_PAYCHANGU_VERIFY_URL') ?: 'https://api.paychangu.com/verify-payment',
            'secret_key' => getenv('MARCHITECH_PAYCHANGU_SECRET_KEY') ?: '',
            'webhook_secret' => getenv('MARCHITECH_PAYCHANGU_WEBHOOK_SECRET') ?: '',
            'callback_url' => getenv('MARCHITECH_PAYCHANGU_CALLBACK_URL') ?: 'http://localhost/marchitech-api/payments/paychangu/webhook',
        ],
    ],
];

$localConfigPath = __DIR__ . '/config.local.php';
if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (is_array($localConfig)) {
        $config = array_replace_recursive($config, $localConfig);
    }
}

return $config;
