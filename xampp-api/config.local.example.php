<?php

return [
    'payments' => [
        'enabled' => false,
        'paychangu' => [
            'secret_key' => 'PASTE_PAYCHANGU_SECRET_KEY_HERE',
            'webhook_secret' => '',
            'callback_url' => 'http://localhost/marchitech-api/payments/paychangu/webhook',
        ],
    ],
];
