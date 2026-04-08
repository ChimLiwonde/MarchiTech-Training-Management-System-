<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class CertificateController
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
        $programs = $this->accessiblePrograms($user['id'], $role);

        $certificates = $this->accessibleCertificates($user['id'], $role, array_keys($programs));
        $profiles = $this->profilesForCertificatesAndEligibleTrainees($role, $user['id'], $programs, $certificates);
        $attempts = $role === 'admin' || $role === 'trainer'
            ? $this->passedAttemptsForPrograms(array_keys($programs))
            : [];
        $eligibleTrainees = $role === 'admin' || $role === 'trainer'
            ? $this->eligibleTraineesForPrograms(array_keys($programs))
            : [];

        Response::json([
            'data' => $certificates,
            'programs' => array_values($programs),
            'profiles' => $profiles,
            'attempts' => $attempts,
            'eligible_trainees' => $eligibleTrainees,
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
        $traineeId = trim((string) ($payload['trainee_id'] ?? ''));
        $attemptId = trim((string) ($payload['attempt_id'] ?? '')) ?: null;
        $notes = trim((string) ($payload['notes'] ?? '')) ?: null;

        if ($programId === '' || $traineeId === '') {
            Response::json(['error' => 'program_id and trainee_id are required'], 422);
        }

        $program = $this->findProgram($programId);
        if ($program === null) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $program['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $assessmentId = null;
        if ($attemptId !== null) {
            $attemptStatement = $this->pdo->prepare(
                'SELECT aa.id, aa.assessment_id, aa.trainee_id, aa.passed, a.program_id
                 FROM assessment_attempts aa
                 INNER JOIN assessments a ON a.id = aa.assessment_id
                 WHERE aa.id = :id
                 LIMIT 1'
            );
            $attemptStatement->execute(['id' => $attemptId]);
            $attempt = $attemptStatement->fetch();

            if (!is_array($attempt)) {
                Response::json(['error' => 'Assessment attempt not found'], 404);
            }

            if ((string) $attempt['trainee_id'] !== $traineeId || !(bool) $attempt['passed'] || (string) $attempt['program_id'] !== $programId) {
                Response::json(['error' => 'Selected attempt does not match the trainee, program, or pass requirement'], 422);
            }

            $assessmentId = (string) $attempt['assessment_id'];
        }

        $id = Auth::uuidV4();
        $certificateNumber = $this->generateCertificateNumber();
        $statement = $this->pdo->prepare(
            'INSERT INTO certificates (
                id, trainee_id, program_id, assessment_id, attempt_id, issued_at, certificate_number, issued_by, notes, created_at
             ) VALUES (
                :id, :trainee_id, :program_id, :assessment_id, :attempt_id, NOW(), :certificate_number, :issued_by, :notes, NOW()
             )'
        );
        $statement->execute([
            'id' => $id,
            'trainee_id' => $traineeId,
            'program_id' => $programId,
            'assessment_id' => $assessmentId,
            'attempt_id' => $attemptId,
            'certificate_number' => $certificateNumber,
            'issued_by' => $user['id'],
            'notes' => $notes,
        ]);

        Response::json([
            'message' => 'Certificate issued successfully',
            'id' => $id,
            'certificate_number' => $certificateNumber,
        ], 201);
    }

    public function verifyPublic(): void
    {
        $certificateNumber = strtoupper(trim((string) ($_GET['certificate_number'] ?? '')));
        if ($certificateNumber === '') {
            Response::json(['error' => 'certificate_number is required'], 422);
        }

        $statement = $this->pdo->prepare(
            'SELECT c.certificate_number, c.issued_at, tp.title AS program_title,
                    COALESCE(p.full_name, p.email, c.trainee_id) AS trainee_name
             FROM certificates c
             INNER JOIN training_programs tp ON tp.id = c.program_id
             LEFT JOIN profiles p ON p.user_id = c.trainee_id
             WHERE UPPER(c.certificate_number) = :certificate_number
             LIMIT 1'
        );
        $statement->execute([
            'certificate_number' => $certificateNumber,
        ]);
        $certificate = $statement->fetch();

        if (!is_array($certificate)) {
            Response::json(['data' => null]);
        }

        Response::json([
            'data' => [
                'certificate_number' => (string) $certificate['certificate_number'],
                'issued_at' => (string) $certificate['issued_at'],
                'trainee_name' => (string) $certificate['trainee_name'],
                'program_title' => (string) $certificate['program_title'],
            ],
        ]);
    }

    /**
     * @return array<string, array{id: string, title: string, trainer_id: string}>|array{}
     */
    private function accessiblePrograms(string $userId, string $role): array
    {
        if ($role === 'admin') {
            $statement = $this->pdo->query(
                'SELECT id, title, trainer_id
                 FROM training_programs
                 ORDER BY title ASC'
            );

            return $this->indexPrograms($statement->fetchAll());
        }

        if ($role === 'trainer') {
            $statement = $this->pdo->prepare(
                'SELECT id, title, trainer_id
                 FROM training_programs
                 WHERE trainer_id = :trainer_id
                 ORDER BY title ASC'
            );
            $statement->execute(['trainer_id' => $userId]);

            return $this->indexPrograms($statement->fetchAll());
        }

        $statement = $this->pdo->prepare(
            'SELECT DISTINCT tp.id, tp.title, tp.trainer_id
             FROM training_programs tp
             INNER JOIN certificates c ON c.program_id = tp.id
             WHERE c.trainee_id = :trainee_id
             ORDER BY tp.title ASC'
        );
        $statement->execute(['trainee_id' => $userId]);

        return $this->indexPrograms($statement->fetchAll());
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<string, array{id: string, title: string, trainer_id: string}>
     */
    private function indexPrograms(array $rows): array
    {
        $indexed = [];
        foreach ($rows as $row) {
            $programId = (string) ($row['id'] ?? '');
            if ($programId === '') {
                continue;
            }

            $indexed[$programId] = [
                'id' => $programId,
                'title' => (string) ($row['title'] ?? 'Unknown'),
                'trainer_id' => (string) ($row['trainer_id'] ?? ''),
            ];
        }

        return $indexed;
    }

    /**
     * @param list<string> $programIds
     * @return array<int, array<string, mixed>>
     */
    private function accessibleCertificates(string $userId, string $role, array $programIds): array
    {
        if ($role === 'trainee') {
            $statement = $this->pdo->prepare(
                'SELECT *
                 FROM certificates
                 WHERE trainee_id = :trainee_id
                 ORDER BY issued_at DESC, created_at DESC'
            );
            $statement->execute(['trainee_id' => $userId]);

            return array_map(fn (array $row): array => $this->mapCertificate($row), $statement->fetchAll());
        }

        if ($programIds === []) {
            return [];
        }

        [$inClause, $params] = $this->buildInClause($programIds, 'program_');
        $statement = $this->pdo->prepare(
            "SELECT *
             FROM certificates
             WHERE program_id IN ({$inClause})
             ORDER BY issued_at DESC, created_at DESC"
        );
        $statement->execute($params);

        return array_map(fn (array $row): array => $this->mapCertificate($row), $statement->fetchAll());
    }

    /**
     * @param array<string, array{id: string, title: string, trainer_id: string}> $programs
     * @param array<int, array<string, mixed>> $certificates
     * @return array<int, array<string, mixed>>
     */
    private function profilesForCertificatesAndEligibleTrainees(string $role, string $userId, array $programs, array $certificates): array
    {
        $userIds = [];

        foreach ($certificates as $certificate) {
            $userIds[(string) $certificate['trainee_id']] = true;
        }

        if ($role === 'admin' || $role === 'trainer') {
            foreach ($this->eligibleTraineesForPrograms(array_keys($programs)) as $eligible) {
                $userIds[(string) $eligible['user_id']] = true;
            }
        } else {
            $userIds[$userId] = true;
        }

        $ids = array_keys($userIds);
        if ($ids === []) {
            return [];
        }

        [$inClause, $params] = $this->buildInClause($ids, 'user_');
        $statement = $this->pdo->prepare(
            "SELECT user_id, full_name, email
             FROM profiles
             WHERE user_id IN ({$inClause})
             ORDER BY COALESCE(full_name, email, user_id) ASC"
        );
        $statement->execute($params);

        return array_map(
            static fn (array $row): array => [
                'user_id' => (string) $row['user_id'],
                'full_name' => $row['full_name'],
                'email' => (string) $row['email'],
            ],
            $statement->fetchAll()
        );
    }

    /**
     * @param list<string> $programIds
     * @return array<int, array<string, mixed>>
     */
    private function passedAttemptsForPrograms(array $programIds): array
    {
        if ($programIds === []) {
            return [];
        }

        [$inClause, $params] = $this->buildInClause($programIds, 'program_');
        $statement = $this->pdo->prepare(
            "SELECT aa.id, aa.assessment_id, aa.trainee_id, aa.score, aa.passed, aa.completed_at, a.program_id
             FROM assessment_attempts aa
             INNER JOIN assessments a ON a.id = aa.assessment_id
             WHERE a.program_id IN ({$inClause})
               AND aa.passed = 1
             ORDER BY aa.completed_at DESC, aa.created_at DESC"
        );
        $statement->execute($params);

        return array_map(
            static fn (array $row): array => [
                'id' => (string) $row['id'],
                'assessment_id' => (string) $row['assessment_id'],
                'trainee_id' => (string) $row['trainee_id'],
                'program_id' => (string) $row['program_id'],
                'score' => $row['score'] !== null ? (int) $row['score'] : null,
                'passed' => $row['passed'] !== null ? (bool) $row['passed'] : null,
                'completed_at' => $row['completed_at'],
            ],
            $statement->fetchAll()
        );
    }

    /**
     * @param list<string> $programIds
     * @return array<int, array<string, string>>
     */
    private function eligibleTraineesForPrograms(array $programIds): array
    {
        if ($programIds === []) {
            return [];
        }

        [$inClause, $params] = $this->buildInClause($programIds, 'program_');
        $statement = $this->pdo->prepare(
            "SELECT DISTINCT program_id, trainee_id
             FROM enrollments
             WHERE program_id IN ({$inClause})
               AND status = :status
             ORDER BY program_id ASC, trainee_id ASC"
        );
        $statement->execute([
            ...$params,
            'status' => 'approved',
        ]);

        return array_map(
            static fn (array $row): array => [
                'program_id' => (string) $row['program_id'],
                'user_id' => (string) $row['trainee_id'],
            ],
            $statement->fetchAll()
        );
    }

    /**
     * @param list<string> $values
     * @return array{0: string, 1: array<string, string>}
     */
    private function buildInClause(array $values, string $prefix): array
    {
        $placeholders = [];
        $params = [];

        foreach (array_values($values) as $index => $value) {
            $key = $prefix . $index;
            $placeholders[] = ':' . $key;
            $params[$key] = $value;
        }

        return [implode(', ', $placeholders), $params];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findProgram(string $programId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, title, trainer_id
             FROM training_programs
             WHERE id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $programId]);
        $program = $statement->fetch();

        return is_array($program) ? $program : null;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function mapCertificate(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'trainee_id' => (string) $row['trainee_id'],
            'program_id' => (string) $row['program_id'],
            'assessment_id' => $row['assessment_id'],
            'attempt_id' => $row['attempt_id'],
            'issued_at' => (string) $row['issued_at'],
            'certificate_number' => (string) $row['certificate_number'],
            'issued_by' => (string) $row['issued_by'],
            'notes' => $row['notes'],
        ];
    }

    private function generateCertificateNumber(): string
    {
        do {
            $candidate = 'CERT-' . strtoupper(bin2hex(random_bytes(4)));
            $statement = $this->pdo->prepare(
                'SELECT id
                 FROM certificates
                 WHERE certificate_number = :certificate_number
                 LIMIT 1'
            );
            $statement->execute(['certificate_number' => $candidate]);
            $existing = $statement->fetch();
        } while (is_array($existing));

        return $candidate;
    }
}
