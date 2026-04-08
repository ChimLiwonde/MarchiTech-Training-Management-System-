<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\NotificationService;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class PaymentController
{
    /**
     * @param array<string, mixed> $config
     */
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth,
        private readonly NotificationService $notifications,
        private readonly array $config
    ) {
    }

    public function myPayments(): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'SELECT id, trainee_id, program_id, enrollment_id, provider, provider_reference, amount, currency, status, created_at, updated_at
             FROM payments
             WHERE trainee_id = :trainee_id
             ORDER BY updated_at DESC, created_at DESC'
        );
        $statement->execute([
            'trainee_id' => $user['id'],
        ]);

        Response::json([
            'data' => array_map(
                fn (array $row): array => $this->mapPayment($row),
                $statement->fetchAll()
            ),
        ]);
    }

    public function initiateCheckout(): void
    {
        $user = $this->auth->requireUser();
        if (($user['role'] ?? 'trainee') !== 'trainee') {
            Response::json(['error' => 'Only trainees can initiate payments'], 403);
        }

        if (!$this->paymentsEnabled()) {
            Response::json(['error' => 'Payments are disabled in this XAMPP setup'], 503);
        }

        $secretKey = $this->secretKey();
        if ($secretKey === '') {
            Response::json(['error' => 'PayChangu secret key is not configured'], 503);
        }

        $payload = Request::json();
        $programId = trim((string) ($payload['program_id'] ?? ''));
        $returnUrl = trim((string) ($payload['return_url'] ?? ''));
        $callbackUrl = trim((string) ($payload['callback_url'] ?? '')) ?: $this->callbackUrl();

        if ($programId === '' || $returnUrl === '') {
            Response::json(['error' => 'program_id and return_url are required'], 422);
        }

        $program = $this->findProgram($programId);
        if ($program === null) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        if (($program['status'] ?? 'draft') !== 'active') {
            Response::json(['error' => 'Only active programs can be paid for'], 422);
        }

        $amount = round((float) ($program['fee_amount'] ?? 0), 2);
        if ($amount <= 0) {
            Response::json(['error' => 'Program fee must be greater than zero'], 422);
        }

        $currency = trim((string) ($program['currency'] ?? 'MWK')) ?: 'MWK';
        [$enrollmentId, $alreadyApproved] = $this->ensurePendingEnrollment((string) $user['id'], $programId);
        if ($alreadyApproved) {
            Response::json([
                'error' => 'You are already approved for this training program',
            ], 409);
        }

        $txRef = $this->generateTxRef();
        $paymentId = $this->upsertPendingPayment(
            (string) $user['id'],
            $programId,
            $enrollmentId,
            $txRef,
            $amount,
            $currency
        );

        $checkoutPayload = [
            'amount' => $amount,
            'currency' => $currency,
            'email' => (string) ($user['email'] ?? ''),
            'callback_url' => $callbackUrl,
            'return_url' => $returnUrl,
            'tx_ref' => $txRef,
            'customization' => [
                'title' => "M'archiTech Training Payment",
                'description' => (string) ($program['title'] ?? 'Training payment'),
            ],
            'meta' => [
                'payment_id' => $paymentId,
                'program_id' => $programId,
                'trainee_id' => (string) $user['id'],
                'enrollment_id' => $enrollmentId,
                'tx_ref' => $txRef,
            ],
        ];

        [$firstName, $lastName] = $this->splitName((string) ($user['full_name'] ?? ''));
        if ($firstName !== '') {
            $checkoutPayload['first_name'] = $firstName;
        }
        if ($lastName !== '') {
            $checkoutPayload['last_name'] = $lastName;
        }

        $response = $this->sendJsonRequest(
            'POST',
            $this->paymentUrl(),
            $checkoutPayload,
            $secretKey
        );

        if (($response['status'] ?? '') !== 'success') {
            Response::json([
                'error' => 'PayChangu initiation failed',
                'details' => $response,
            ], 502);
        }

        $checkoutUrl = $response['data']['checkout_url'] ?? null;
        if (!is_string($checkoutUrl) || trim($checkoutUrl) === '') {
            Response::json([
                'error' => 'Missing checkout_url in PayChangu response',
                'details' => $response,
            ], 502);
        }

        Response::json([
            'message' => 'Checkout session created successfully',
            'checkout_url' => $checkoutUrl,
            'tx_ref' => $txRef,
        ]);
    }

    public function verify(): void
    {
        $user = $this->auth->requireUser();
        if (($user['role'] ?? 'trainee') !== 'trainee') {
            Response::json(['error' => 'Only trainees can verify payments'], 403);
        }

        if (!$this->paymentsEnabled()) {
            Response::json(['error' => 'Payments are disabled in this XAMPP setup'], 503);
        }

        $payload = Request::json();
        $txRef = trim((string) ($payload['tx_ref'] ?? ''));
        $programId = trim((string) ($payload['program_id'] ?? ''));

        if ($txRef === '' && $programId === '') {
            Response::json(['error' => 'tx_ref or program_id is required'], 422);
        }

        if ($txRef === '') {
            $statement = $this->pdo->prepare(
                'SELECT provider_reference
                 FROM payments
                 WHERE trainee_id = :trainee_id
                   AND program_id = :program_id
                 LIMIT 1'
            );
            $statement->execute([
                'trainee_id' => $user['id'],
                'program_id' => $programId,
            ]);
            $payment = $statement->fetch();

            $txRef = is_array($payment) ? trim((string) ($payment['provider_reference'] ?? '')) : '';
            if ($txRef === '') {
                Response::json(['error' => 'No pending payment reference found for this program'], 404);
            }
        }

        $result = $this->verifyAndFinalize($txRef, (string) $user['id']);
        Response::json($result);
    }

    public function handleWebhook(): void
    {
        if (!$this->paymentsEnabled()) {
            Response::json(['received' => true, 'ignored' => true]);
        }

        $rawBody = Request::rawBody();
        $webhookSecret = $this->webhookSecret();
        $signature = trim((string) ($_SERVER['HTTP_SIGNATURE'] ?? ''));

        if ($webhookSecret !== '' && $signature !== '' && !$this->isValidSignature($rawBody, $signature, $webhookSecret)) {
            Response::json(['error' => 'Invalid signature'], 401);
        }

        $payload = Request::json();
        $txRef = $this->extractTxRef($payload);
        if ($txRef === '') {
            Response::json([
                'received' => true,
                'ignored' => true,
            ]);
        }

        $result = $this->verifyAndFinalize($txRef, null);
        Response::json([
            'received' => true,
            'updated' => true,
            'status' => $result['status'] ?? 'pending',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function verifyAndFinalize(string $txRef, ?string $expectedTraineeId): array
    {
        if ($this->secretKey() === '') {
            Response::json(['error' => 'PayChangu secret key is not configured'], 503);
        }

        $paymentStatement = $this->pdo->prepare(
            'SELECT id, trainee_id, program_id, enrollment_id, provider_reference, amount, currency, status
             FROM payments
             WHERE provider_reference = :provider_reference
             LIMIT 1'
        );
        $paymentStatement->execute([
            'provider_reference' => $txRef,
        ]);
        $payment = $paymentStatement->fetch();

        if (!is_array($payment)) {
            Response::json(['error' => 'Payment reference not found or no longer current'], 404);
        }

        if ($expectedTraineeId !== null && (string) $payment['trainee_id'] !== $expectedTraineeId) {
            Response::json(['error' => 'Payment not found'], 404);
        }

        $previousStatus = (string) ($payment['status'] ?? 'pending');

        $verification = $this->sendJsonRequest(
            'GET',
            rtrim($this->verifyUrl(), '/') . '/' . rawurlencode($txRef),
            null,
            $this->secretKey()
        );

        if (($verification['status'] ?? '') !== 'success') {
            Response::json([
                'error' => 'PayChangu verification failed',
                'details' => $verification,
            ], 502);
        }

        $verificationData = is_array($verification['data'] ?? null) ? $verification['data'] : [];
        $normalizedStatus = $this->normalizePaymentStatus((string) ($verificationData['status'] ?? 'pending'));
        $amount = round((float) ($verificationData['amount'] ?? $payment['amount'] ?? 0), 2);
        $currency = trim((string) ($verificationData['currency'] ?? $payment['currency'] ?? 'MWK')) ?: 'MWK';
        $paymentId = (string) $payment['id'];
        $traineeId = (string) $payment['trainee_id'];
        $programId = (string) $payment['program_id'];
        $enrollmentId = trim((string) ($payment['enrollment_id'] ?? ''));

        $program = $this->findProgram($programId);
        if ($program === null) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        $expectedAmount = round((float) ($program['fee_amount'] ?? 0), 2);
        $expectedCurrency = trim((string) ($program['currency'] ?? 'MWK')) ?: 'MWK';

        if ($normalizedStatus === 'successful' && ($amount < $expectedAmount || strtoupper($currency) !== strtoupper($expectedCurrency))) {
            $normalizedStatus = 'failed';
        }

        $updateStatement = $this->pdo->prepare(
            'UPDATE payments
             SET amount = :amount,
                 currency = :currency,
                 status = :status,
                 raw_payload = :raw_payload,
                 updated_at = NOW()
             WHERE id = :id'
        );
        $updateStatement->execute([
            'amount' => $amount,
            'currency' => $currency,
            'status' => $normalizedStatus,
            'raw_payload' => json_encode($verification, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'id' => $paymentId,
        ]);

        $enrollmentStatus = null;
        if ($enrollmentId !== '') {
            $enrollmentStatus = $normalizedStatus === 'successful'
                ? 'approved'
                : ($normalizedStatus === 'pending' ? 'pending' : 'rejected');

            $enrollmentStatement = $this->pdo->prepare(
                'UPDATE enrollments
                 SET status = :status, updated_at = NOW()
                 WHERE id = :id'
            );
            $enrollmentStatement->execute([
                'status' => $enrollmentStatus,
                'id' => $enrollmentId,
            ]);
        }

        if ($previousStatus !== $normalizedStatus) {
            $this->notifyPaymentStatus(
                $traineeId,
                (string) ($program['trainer_id'] ?? ''),
                (string) ($program['title'] ?? 'Training program'),
                $normalizedStatus,
                $enrollmentStatus
            );
        }

        return [
            'message' => $this->statusMessage($normalizedStatus, (string) ($program['title'] ?? 'training program')),
            'status' => $normalizedStatus,
            'payment' => [
                'id' => $paymentId,
                'program_id' => $programId,
                'trainee_id' => $traineeId,
                'amount' => $amount,
                'currency' => $currency,
                'status' => $normalizedStatus,
            ],
            'enrollment_status' => $enrollmentStatus,
        ];
    }

    /**
     * @return array{0: string, 1: bool}
     */
    private function ensurePendingEnrollment(string $traineeId, string $programId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, status
             FROM enrollments
             WHERE trainee_id = :trainee_id
               AND program_id = :program_id
             LIMIT 1'
        );
        $statement->execute([
            'trainee_id' => $traineeId,
            'program_id' => $programId,
        ]);
        $enrollment = $statement->fetch();

        if (is_array($enrollment)) {
            $enrollmentId = (string) $enrollment['id'];
            if (($enrollment['status'] ?? '') === 'approved') {
                return [$enrollmentId, true];
            }

            $updateStatement = $this->pdo->prepare(
                'UPDATE enrollments
                 SET status = :status, updated_at = NOW()
                 WHERE id = :id'
            );
            $updateStatement->execute([
                'status' => 'pending',
                'id' => $enrollmentId,
            ]);

            return [$enrollmentId, false];
        }

        $enrollmentId = Auth::uuidV4();
        $insertStatement = $this->pdo->prepare(
            'INSERT INTO enrollments (id, program_id, trainee_id, status, enrolled_at, updated_at)
             VALUES (:id, :program_id, :trainee_id, :status, NOW(), NOW())'
        );
        $insertStatement->execute([
            'id' => $enrollmentId,
            'program_id' => $programId,
            'trainee_id' => $traineeId,
            'status' => 'pending',
        ]);

        return [$enrollmentId, false];
    }

    private function upsertPendingPayment(
        string $traineeId,
        string $programId,
        string $enrollmentId,
        string $txRef,
        float $amount,
        string $currency
    ): string {
        $statement = $this->pdo->prepare(
            'SELECT id
             FROM payments
             WHERE trainee_id = :trainee_id
               AND program_id = :program_id
             LIMIT 1'
        );
        $statement->execute([
            'trainee_id' => $traineeId,
            'program_id' => $programId,
        ]);
        $payment = $statement->fetch();

        if (is_array($payment)) {
            $paymentId = (string) $payment['id'];
            $updateStatement = $this->pdo->prepare(
                'UPDATE payments
                 SET enrollment_id = :enrollment_id,
                     provider = :provider,
                     provider_reference = :provider_reference,
                     amount = :amount,
                     currency = :currency,
                     status = :status,
                     raw_payload = :raw_payload,
                     updated_at = NOW()
                 WHERE id = :id'
            );
            $updateStatement->execute([
                'enrollment_id' => $enrollmentId,
                'provider' => 'paychangu',
                'provider_reference' => $txRef,
                'amount' => $amount,
                'currency' => $currency,
                'status' => 'pending',
                'raw_payload' => json_encode(['tx_ref' => $txRef], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'id' => $paymentId,
            ]);

            return $paymentId;
        }

        $paymentId = Auth::uuidV4();
        $insertStatement = $this->pdo->prepare(
            'INSERT INTO payments (
                id, trainee_id, program_id, enrollment_id, provider, provider_reference, amount, currency, status, raw_payload, created_at, updated_at
             ) VALUES (
                :id, :trainee_id, :program_id, :enrollment_id, :provider, :provider_reference, :amount, :currency, :status, :raw_payload, NOW(), NOW()
             )'
        );
        $insertStatement->execute([
            'id' => $paymentId,
            'trainee_id' => $traineeId,
            'program_id' => $programId,
            'enrollment_id' => $enrollmentId,
            'provider' => 'paychangu',
            'provider_reference' => $txRef,
            'amount' => $amount,
            'currency' => $currency,
            'status' => 'pending',
            'raw_payload' => json_encode(['tx_ref' => $txRef], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);

        return $paymentId;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findProgram(string $programId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, title, trainer_id, fee_amount, currency, status
             FROM training_programs
             WHERE id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $programId]);
        $program = $statement->fetch();

        return is_array($program) ? $program : null;
    }

    private function paymentsEnabled(): bool
    {
        return (bool) ($this->config['enabled'] ?? false);
    }

    private function paymentUrl(): string
    {
        return (string) ($this->config['paychangu']['payment_url'] ?? 'https://api.paychangu.com/payment');
    }

    private function verifyUrl(): string
    {
        return (string) ($this->config['paychangu']['verify_url'] ?? 'https://api.paychangu.com/verify-payment');
    }

    private function secretKey(): string
    {
        return trim((string) ($this->config['paychangu']['secret_key'] ?? ''));
    }

    private function webhookSecret(): string
    {
        return trim((string) ($this->config['paychangu']['webhook_secret'] ?? ''));
    }

    private function callbackUrl(): string
    {
        return trim((string) ($this->config['paychangu']['callback_url'] ?? ''));
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<string, mixed>
     */
    private function sendJsonRequest(string $method, string $url, ?array $payload, string $secretKey): array
    {
        if (!function_exists('curl_init')) {
            Response::json(['error' => 'cURL is required for PayChangu integration'], 500);
        }

        $ch = curl_init($url);
        if ($ch === false) {
            Response::json(['error' => 'Unable to initialize PayChangu request'], 500);
        }

        $headers = [
            'Accept: application/json',
            'Authorization: Bearer ' . $secretKey,
        ];

        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 30,
        ]);

        $body = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            Response::json([
                'error' => 'PayChangu request failed',
                'message' => $error !== '' ? $error : 'Unknown cURL error',
            ], 502);
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            Response::json([
                'error' => 'Invalid PayChangu response',
                'status_code' => $statusCode,
                'body' => $body,
            ], 502);
        }

        return $decoded;
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function splitName(string $fullName): array
    {
        $trimmed = trim($fullName);
        if ($trimmed === '') {
            return ['', ''];
        }

        $parts = preg_split('/\s+/', $trimmed) ?: [];
        $firstName = (string) array_shift($parts);
        $lastName = implode(' ', $parts);

        return [$firstName, $lastName];
    }

    private function generateTxRef(): string
    {
        return 'MARCHI-' . strtoupper(str_replace('-', '', Auth::uuidV4()));
    }

    private function normalizePaymentStatus(string $status): string
    {
        $normalized = strtolower(trim($status));

        return match (true) {
            $normalized === 'success',
            $normalized === 'successful',
            $normalized === 'paid',
            $normalized === 'completed' => 'successful',
            str_contains($normalized, 'cancel') => 'cancelled',
            str_contains($normalized, 'fail'),
            str_contains($normalized, 'declin'),
            str_contains($normalized, 'error') => 'failed',
            default => 'pending',
        };
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function extractTxRef(array $payload): string
    {
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $meta = is_array($data['meta'] ?? null)
            ? $data['meta']
            : (is_array($payload['meta'] ?? null) ? $payload['meta'] : []);

        return trim((string) (
            $data['tx_ref']
            ?? $payload['tx_ref']
            ?? $meta['tx_ref']
            ?? ''
        ));
    }

    private function isValidSignature(string $rawBody, string $signature, string $secret): bool
    {
        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals(strtolower($expected), strtolower(trim($signature)));
    }

    private function notifyPaymentStatus(
        string $traineeId,
        string $trainerId,
        string $programTitle,
        string $paymentStatus,
        ?string $enrollmentStatus
    ): void {
        if ($paymentStatus === 'successful') {
            $this->notifications->create(
                $traineeId,
                'Payment Confirmed',
                "Your payment for {$programTitle} was confirmed and your enrollment is active.",
                'info',
                '/trainings'
            );

            if ($trainerId !== '') {
                $this->notifications->create(
                    $trainerId,
                    'Enrollment Paid',
                    "A trainee completed payment for {$programTitle}.",
                    'enrollment',
                    '/trainings'
                );
            }

            return;
        }

        if ($paymentStatus === 'failed' || $paymentStatus === 'cancelled') {
            $this->notifications->create(
                $traineeId,
                'Payment Incomplete',
                "Your payment for {$programTitle} was not completed. You can try again from the trainings page.",
                'info',
                '/trainings'
            );
        }
    }

    private function statusMessage(string $status, string $programTitle): string
    {
        return match ($status) {
            'successful' => "Payment verified successfully for {$programTitle}.",
            'failed' => "Payment verification failed for {$programTitle}.",
            'cancelled' => "Payment was cancelled for {$programTitle}.",
            default => "Payment is still pending for {$programTitle}.",
        };
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function mapPayment(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'trainee_id' => (string) $row['trainee_id'],
            'program_id' => (string) $row['program_id'],
            'enrollment_id' => $row['enrollment_id'],
            'provider' => (string) ($row['provider'] ?? 'paychangu'),
            'provider_reference' => $row['provider_reference'],
            'amount' => (float) ($row['amount'] ?? 0),
            'currency' => (string) ($row['currency'] ?? 'MWK'),
            'status' => (string) ($row['status'] ?? 'pending'),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
}
