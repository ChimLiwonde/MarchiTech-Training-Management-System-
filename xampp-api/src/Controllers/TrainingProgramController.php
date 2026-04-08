<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class TrainingProgramController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function index(): void
    {
        $currentUser = $this->auth->userFromRequest();

        $sql = 'SELECT tp.*, p.full_name AS trainer_name
                FROM training_programs tp
                LEFT JOIN profiles p ON p.user_id = tp.trainer_id';
        $params = [];

        if ($currentUser === null || ($currentUser['role'] ?? 'trainee') === 'trainee') {
            $sql .= ' WHERE tp.status = :status';
            $params['status'] = 'active';
        }

        $sql .= ' ORDER BY tp.created_at DESC';

        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);

        Response::json([
            'data' => $statement->fetchAll(),
        ]);
    }

    public function create(): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $payload = Request::json();
        $title = trim((string) ($payload['title'] ?? ''));

        if ($title === '') {
            Response::json(['error' => 'title is required'], 422);
        }

        $id = Auth::uuidV4();
        $statement = $this->pdo->prepare(
            'INSERT INTO training_programs (
                id, title, description, trainer_id, start_date, end_date,
                max_trainees, fee_amount, cost_amount, currency, status, created_at, updated_at
             ) VALUES (
                :id, :title, :description, :trainer_id, :start_date, :end_date,
                :max_trainees, :fee_amount, :cost_amount, :currency, :status, NOW(), NOW()
             )'
        );
        $statement->execute([
            'id' => $id,
            'title' => $title,
            'description' => trim((string) ($payload['description'] ?? '')) ?: null,
            'trainer_id' => $role === 'trainer' ? $user['id'] : ((string) ($payload['trainer_id'] ?? $user['id'])),
            'start_date' => trim((string) ($payload['start_date'] ?? '')) ?: null,
            'end_date' => trim((string) ($payload['end_date'] ?? '')) ?: null,
            'max_trainees' => (int) ($payload['max_trainees'] ?? 30),
            'fee_amount' => (float) ($payload['fee_amount'] ?? 0),
            'cost_amount' => (float) ($payload['cost_amount'] ?? 0),
            'currency' => trim((string) ($payload['currency'] ?? 'MWK')) ?: 'MWK',
            'status' => trim((string) ($payload['status'] ?? 'draft')) ?: 'draft',
        ]);

        Response::json([
            'message' => 'Training program created',
            'id' => $id,
        ], 201);
    }

    public function updateStatus(string $programId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $payload = Request::json();
        $status = trim((string) ($payload['status'] ?? ''));

        if (!in_array($status, ['draft', 'active', 'completed', 'cancelled'], true)) {
            Response::json(['error' => 'Invalid program status'], 422);
        }

        $statement = $this->pdo->prepare(
            'SELECT id, trainer_id
             FROM training_programs
             WHERE id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $programId]);
        $program = $statement->fetch();

        if (!is_array($program)) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $program['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $updateStatement = $this->pdo->prepare(
            'UPDATE training_programs
             SET status = :status, updated_at = NOW()
             WHERE id = :id'
        );
        $updateStatement->execute([
            'status' => $status,
            'id' => $programId,
        ]);

        Response::json([
            'message' => 'Training program status updated',
            'status' => $status,
        ]);
    }
}
