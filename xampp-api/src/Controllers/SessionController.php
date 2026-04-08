<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class SessionController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function index(): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role === 'trainee') {
            $statement = $this->pdo->prepare(
                'SELECT DISTINCT s.*, tp.title AS program_title, tp.trainer_id, p.full_name AS trainer_name
                 FROM sessions s
                 INNER JOIN training_programs tp ON tp.id = s.program_id
                 LEFT JOIN profiles p ON p.user_id = tp.trainer_id
                 INNER JOIN enrollments e ON e.program_id = s.program_id
                 WHERE e.trainee_id = :user_id
                   AND e.status = :enrollment_status
                 ORDER BY s.session_date ASC, s.start_time ASC, s.created_at ASC'
            );
            $statement->execute([
                'user_id' => $user['id'],
                'enrollment_status' => 'approved',
            ]);
        } elseif ($role === 'trainer') {
            $statement = $this->pdo->prepare(
                'SELECT s.*, tp.title AS program_title, tp.trainer_id, p.full_name AS trainer_name
                 FROM sessions s
                 INNER JOIN training_programs tp ON tp.id = s.program_id
                 LEFT JOIN profiles p ON p.user_id = tp.trainer_id
                 WHERE tp.trainer_id = :user_id
                 ORDER BY s.session_date ASC, s.start_time ASC, s.created_at ASC'
            );
            $statement->execute([
                'user_id' => $user['id'],
            ]);
        } else {
            $statement = $this->pdo->query(
                'SELECT s.*, tp.title AS program_title, tp.trainer_id, p.full_name AS trainer_name
                 FROM sessions s
                 INNER JOIN training_programs tp ON tp.id = s.program_id
                 LEFT JOIN profiles p ON p.user_id = tp.trainer_id
                 ORDER BY s.session_date ASC, s.start_time ASC, s.created_at ASC'
            );
        }

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
        $programId = trim((string) ($payload['program_id'] ?? ''));
        $sessionDate = trim((string) ($payload['session_date'] ?? ''));

        if ($programId === '' || $sessionDate === '') {
            Response::json(['error' => 'program_id and session_date are required'], 422);
        }

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

        $id = Auth::uuidV4();
        $statement = $this->pdo->prepare(
            'INSERT INTO sessions (
                id, program_id, session_date, start_time, end_time, location, notes, created_at, updated_at
             ) VALUES (
                :id, :program_id, :session_date, :start_time, :end_time, :location, :notes, NOW(), NOW()
             )'
        );
        $statement->execute([
            'id' => $id,
            'program_id' => $programId,
            'session_date' => $sessionDate,
            'start_time' => trim((string) ($payload['start_time'] ?? '')) ?: null,
            'end_time' => trim((string) ($payload['end_time'] ?? '')) ?: null,
            'location' => trim((string) ($payload['location'] ?? '')) ?: null,
            'notes' => trim((string) ($payload['notes'] ?? '')) ?: null,
        ]);

        Response::json([
            'message' => 'Session created',
            'id' => $id,
        ], 201);
    }

    public function delete(string $sessionId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT s.id, tp.trainer_id
             FROM sessions s
             INNER JOIN training_programs tp ON tp.id = s.program_id
             WHERE s.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $sessionId]);
        $session = $statement->fetch();

        if (!is_array($session)) {
            Response::json(['error' => 'Session not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $session['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $deleteStatement = $this->pdo->prepare('DELETE FROM sessions WHERE id = :id');
        $deleteStatement->execute(['id' => $sessionId]);

        Response::json([
            'message' => 'Session deleted',
        ]);
    }
}
