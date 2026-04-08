<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\NotificationService;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class EnrollmentController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth,
        private readonly NotificationService $notifications,
        private readonly bool $paymentsEnabled = false
    ) {
    }

    public function myEnrollments(): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'SELECT e.*
             FROM enrollments e
             WHERE e.trainee_id = :trainee_id
             ORDER BY e.enrolled_at DESC'
        );
        $statement->execute([
            'trainee_id' => $user['id'],
        ]);

        Response::json([
            'data' => $statement->fetchAll(),
        ]);
    }

    public function enrollInProgram(string $programId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'trainee') {
            Response::json(['error' => 'Only trainees can enroll'], 403);
        }

        $programStatement = $this->pdo->prepare(
            'SELECT tp.id, tp.status, tp.title, tp.trainer_id
             FROM training_programs tp
             WHERE tp.id = :id
             LIMIT 1'
        );
        $programStatement->execute(['id' => $programId]);
        $program = $programStatement->fetch();

        if (!is_array($program)) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        if (($program['status'] ?? 'draft') !== 'active') {
            Response::json(['error' => 'Only active programs can be enrolled in'], 422);
        }

        $existingStatement = $this->pdo->prepare(
            'SELECT id, status
             FROM enrollments
             WHERE program_id = :program_id AND trainee_id = :trainee_id
             LIMIT 1'
        );
        $existingStatement->execute([
            'program_id' => $programId,
            'trainee_id' => $user['id'],
        ]);
        $existing = $existingStatement->fetch();

        if (is_array($existing)) {
            if (($existing['status'] ?? '') === 'approved') {
                Response::json([
                    'message' => 'You are already approved for this program.',
                    'id' => $existing['id'],
                    'status' => $existing['status'],
                ]);
            }

            $updateStatement = $this->pdo->prepare(
                'UPDATE enrollments
                 SET status = :status, updated_at = NOW()
                 WHERE id = :id'
            );
            $updateStatement->execute([
                'status' => 'pending',
                'id' => $existing['id'],
            ]);

            $this->notifyTrainerOfEnrollmentRequest(
                (string) $program['trainer_id'],
                (string) $program['title'],
                $this->displayName($user)
            );

            Response::json([
                'message' => 'Enrollment request updated.',
                'id' => $existing['id'],
                'status' => 'pending',
            ]);
        }

        $id = Auth::uuidV4();
        $insertStatement = $this->pdo->prepare(
            'INSERT INTO enrollments (id, program_id, trainee_id, status, enrolled_at, updated_at)
             VALUES (:id, :program_id, :trainee_id, :status, NOW(), NOW())'
        );
        $insertStatement->execute([
            'id' => $id,
            'program_id' => $programId,
            'trainee_id' => $user['id'],
            'status' => 'pending',
        ]);

        $this->notifyTrainerOfEnrollmentRequest(
            (string) $program['trainer_id'],
            (string) $program['title'],
            $this->displayName($user)
        );

        Response::json([
            'message' => 'Enrollment request submitted.',
            'id' => $id,
            'status' => 'pending',
        ], 201);
    }

    public function programEnrollments(string $programId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        $programStatement = $this->pdo->prepare(
            'SELECT id, trainer_id
             FROM training_programs
             WHERE id = :id
             LIMIT 1'
        );
        $programStatement->execute(['id' => $programId]);
        $program = $programStatement->fetch();

        if (!is_array($program)) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $program['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT e.*, p.full_name, p.email
             FROM enrollments e
             LEFT JOIN profiles p ON p.user_id = e.trainee_id
             WHERE e.program_id = :program_id
             ORDER BY e.enrolled_at DESC'
        );
        $statement->execute([
            'program_id' => $programId,
        ]);

        Response::json([
            'data' => $statement->fetchAll(),
        ]);
    }

    public function updateStatus(string $enrollmentId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $payload = Request::json();
        $status = trim((string) ($payload['status'] ?? ''));

        if (!in_array($status, ['pending', 'approved', 'rejected', 'completed', 'withdrawn'], true)) {
            Response::json(['error' => 'Invalid enrollment status'], 422);
        }

        $statement = $this->pdo->prepare(
            'SELECT e.id, e.trainee_id, e.program_id, tp.title AS program_title, tp.trainer_id, tp.fee_amount
             FROM enrollments e
             INNER JOIN training_programs tp ON tp.id = e.program_id
             WHERE e.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $enrollmentId]);
        $enrollment = $statement->fetch();

        if (!is_array($enrollment)) {
            Response::json(['error' => 'Enrollment not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $enrollment['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        if ($status === 'approved' && $this->paymentsEnabled && (float) ($enrollment['fee_amount'] ?? 0) > 0) {
            $paymentStatement = $this->pdo->prepare(
                'SELECT id, status
                 FROM payments
                 WHERE program_id = :program_id
                   AND trainee_id = :trainee_id
                 LIMIT 1'
            );
            $paymentStatement->execute([
                'program_id' => $enrollment['program_id'],
                'trainee_id' => $enrollment['trainee_id'],
            ]);
            $payment = $paymentStatement->fetch();

            if (!is_array($payment) || ($payment['status'] ?? '') !== 'successful') {
                Response::json([
                    'error' => 'This enrollment can only be approved after successful payment verification.',
                ], 422);
            }
        }

        $updateStatement = $this->pdo->prepare(
            'UPDATE enrollments
             SET status = :status, updated_at = NOW()
             WHERE id = :id'
        );
        $updateStatement->execute([
            'status' => $status,
            'id' => $enrollmentId,
        ]);

        $statusLabel = ucfirst($status);
        $this->notifications->create(
            (string) $enrollment['trainee_id'],
            "Enrollment {$statusLabel}",
            'Your enrollment for ' . (string) $enrollment['program_title'] . " is now {$status}.",
            'enrollment',
            '/trainings'
        );

        Response::json([
            'message' => 'Enrollment status updated',
            'status' => $status,
        ]);
    }

    private function displayName(array $user): string
    {
        $fullName = trim((string) ($user['full_name'] ?? ''));
        if ($fullName !== '') {
            return $fullName;
        }

        return (string) ($user['email'] ?? 'A trainee');
    }

    private function notifyTrainerOfEnrollmentRequest(string $trainerId, string $programTitle, string $traineeName): void
    {
        if ($trainerId === '') {
            return;
        }

        $this->notifications->create(
            $trainerId,
            'New Enrollment Request',
            "{$traineeName} requested enrollment in {$programTitle}.",
            'enrollment',
            '/trainings'
        );
    }
}
