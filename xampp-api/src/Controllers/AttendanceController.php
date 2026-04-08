<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class AttendanceController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function index(string $sessionId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';
        $session = $this->requireSession($sessionId);

        if ($role === 'admin' || ($role === 'trainer' && $session['trainer_id'] === $user['id'])) {
            $statement = $this->pdo->prepare(
                'SELECT a.id, a.session_id, a.trainee_id, a.status, a.checked_in_at,
                        p.full_name AS trainee_name, p.email AS trainee_email
                 FROM attendance a
                 LEFT JOIN profiles p ON p.user_id = a.trainee_id
                 WHERE a.session_id = :session_id
                 ORDER BY COALESCE(p.full_name, p.email, a.trainee_id) ASC'
            );
            $statement->execute([
                'session_id' => $sessionId,
            ]);
        } elseif ($role === 'trainee') {
            $this->assertApprovedEnrollment($session['program_id'], $user['id']);

            $statement = $this->pdo->prepare(
                'SELECT a.id, a.session_id, a.trainee_id, a.status, a.checked_in_at,
                        p.full_name AS trainee_name, p.email AS trainee_email
                 FROM attendance a
                 LEFT JOIN profiles p ON p.user_id = a.trainee_id
                 WHERE a.session_id = :session_id AND a.trainee_id = :trainee_id
                 LIMIT 1'
            );
            $statement->execute([
                'session_id' => $sessionId,
                'trainee_id' => $user['id'],
            ]);
        } else {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $rows = $statement->fetchAll();
        Response::json([
            'data' => $rows,
        ]);
    }

    public function initialize(string $sessionId): void
    {
        $user = $this->auth->requireUser();
        $session = $this->requireManageableSession($sessionId, $user);

        $countStatement = $this->pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM enrollments
             WHERE program_id = :program_id AND status = :status'
        );
        $countStatement->execute([
            'program_id' => $session['program_id'],
            'status' => 'approved',
        ]);
        $approvedCount = (int) (($countStatement->fetch()['total'] ?? 0));

        if ($approvedCount === 0) {
            Response::json([
                'error' => 'No approved trainees are enrolled in this program.',
            ], 422);
        }

        $insertStatement = $this->pdo->prepare(
            'INSERT INTO attendance (id, session_id, trainee_id, status, created_at, updated_at)
             SELECT UUID(), :session_id, e.trainee_id, :attendance_status, NOW(), NOW()
             FROM enrollments e
             WHERE e.program_id = :program_id
               AND e.status = :enrollment_status
               AND NOT EXISTS (
                   SELECT 1
                   FROM attendance a
                   WHERE a.session_id = :session_id_check
                     AND a.trainee_id = e.trainee_id
               )'
        );
        $insertStatement->execute([
            'session_id' => $sessionId,
            'attendance_status' => 'absent',
            'program_id' => $session['program_id'],
            'enrollment_status' => 'approved',
            'session_id_check' => $sessionId,
        ]);

        $created = $insertStatement->rowCount();
        Response::json([
            'message' => $created > 0 ? 'Attendance initialized' : 'Attendance roster already initialized',
            'created' => $created,
        ]);
    }

    public function update(string $attendanceId): void
    {
        $user = $this->auth->requireUser();
        $record = $this->requireManageableAttendance($attendanceId, $user);

        $payload = Request::json();
        $status = trim((string) ($payload['status'] ?? ''));

        if (!in_array($status, ['present', 'late', 'absent', 'excused'], true)) {
            Response::json(['error' => 'Invalid attendance status'], 422);
        }

        $statement = $this->pdo->prepare(
            'UPDATE attendance
             SET status = :status,
                 checked_in_at = CASE
                     WHEN :status_check IN (\'present\', \'late\') THEN COALESCE(checked_in_at, NOW())
                     ELSE checked_in_at
                 END,
                 updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            'status' => $status,
            'status_check' => $status,
            'id' => $record['id'],
        ]);

        Response::json([
            'message' => 'Attendance status updated',
            'status' => $status,
        ]);
    }

    public function selfCheckIn(string $attendanceId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'trainee') {
            Response::json(['error' => 'Only trainees can self check-in'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT a.id, a.trainee_id
             FROM attendance a
             WHERE a.id = :id
             LIMIT 1'
        );
        $statement->execute([
            'id' => $attendanceId,
        ]);
        $record = $statement->fetch();

        if (!is_array($record)) {
            Response::json(['error' => 'Attendance record not found'], 404);
        }

        if ($record['trainee_id'] !== $user['id']) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $updateStatement = $this->pdo->prepare(
            'UPDATE attendance
             SET status = :status,
                 checked_in_at = NOW(),
                 updated_at = NOW()
             WHERE id = :id'
        );
        $updateStatement->execute([
            'status' => 'present',
            'id' => $attendanceId,
        ]);

        Response::json([
            'message' => 'Checked in successfully',
            'status' => 'present',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function requireSession(string $sessionId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT s.id, s.program_id, s.session_date, tp.trainer_id, tp.title AS program_title
             FROM sessions s
             INNER JOIN training_programs tp ON tp.id = s.program_id
             WHERE s.id = :id
             LIMIT 1'
        );
        $statement->execute([
            'id' => $sessionId,
        ]);
        $session = $statement->fetch();

        if (!is_array($session)) {
            Response::json(['error' => 'Session not found'], 404);
        }

        return $session;
    }

    /**
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function requireManageableSession(string $sessionId, array $user): array
    {
        $role = $user['role'] ?? 'trainee';
        $session = $this->requireSession($sessionId);

        $isOwnerTrainer = $role === 'trainer' && $session['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        return $session;
    }

    /**
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function requireManageableAttendance(string $attendanceId, array $user): array
    {
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT a.id, a.session_id, a.trainee_id, s.program_id, tp.trainer_id
             FROM attendance a
             INNER JOIN sessions s ON s.id = a.session_id
             INNER JOIN training_programs tp ON tp.id = s.program_id
             WHERE a.id = :id
             LIMIT 1'
        );
        $statement->execute([
            'id' => $attendanceId,
        ]);
        $record = $statement->fetch();

        if (!is_array($record)) {
            Response::json(['error' => 'Attendance record not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $record['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        return $record;
    }

    private function assertApprovedEnrollment(string $programId, string $traineeId): void
    {
        $statement = $this->pdo->prepare(
            'SELECT id
             FROM enrollments
             WHERE program_id = :program_id
               AND trainee_id = :trainee_id
               AND status = :status
             LIMIT 1'
        );
        $statement->execute([
            'program_id' => $programId,
            'trainee_id' => $traineeId,
            'status' => 'approved',
        ]);

        if (!is_array($statement->fetch())) {
            Response::json(['error' => 'Forbidden'], 403);
        }
    }
}
