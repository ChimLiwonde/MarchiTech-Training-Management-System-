<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class ResourceController
{
    private const MAX_UPLOAD_BYTES = 20_000_000;

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

        if ($programs === []) {
            Response::json([
                'data' => [],
                'programs' => [],
            ]);
        }

        [$inClause, $params] = $this->buildInClause(array_keys($programs), 'program_');
        $statement = $this->pdo->prepare(
            "SELECT tr.*
             FROM training_resources tr
             WHERE tr.program_id IN ({$inClause})
             ORDER BY tr.created_at DESC"
        );
        $statement->execute($params);

        Response::json([
            'data' => $statement->fetchAll(),
            'programs' => array_values(array_map(
                static fn (array $program): array => [
                    'id' => $program['id'],
                    'title' => $program['title'],
                ],
                $programs
            )),
        ]);
    }

    public function create(): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $payload = $_POST;
        if ($payload === []) {
            $payload = Request::json();
        }

        $programId = trim((string) ($payload['program_id'] ?? ''));
        $title = trim((string) ($payload['title'] ?? ''));
        $description = trim((string) ($payload['description'] ?? '')) ?: null;
        $externalUrl = trim((string) ($payload['external_url'] ?? '')) ?: null;

        if ($programId === '' || $title === '') {
            Response::json(['error' => 'program_id and title are required'], 422);
        }

        $program = $this->findProgram($programId);
        if ($program === null) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $program['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $fileUrl = null;
        $fileType = null;
        $uploadedFile = $_FILES['file'] ?? null;

        if (is_array($uploadedFile) && (int) ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            if ((int) ($uploadedFile['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
                Response::json(['error' => 'File upload failed'], 422);
            }

            $size = (int) ($uploadedFile['size'] ?? 0);
            if ($size <= 0 || $size > self::MAX_UPLOAD_BYTES) {
                Response::json(['error' => 'Uploaded file is too large'], 422);
            }

            $tmpName = (string) ($uploadedFile['tmp_name'] ?? '');
            if ($tmpName === '' || !is_uploaded_file($tmpName)) {
                Response::json(['error' => 'Invalid uploaded file'], 422);
            }

            $originalName = (string) ($uploadedFile['name'] ?? 'resource');
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $safeName = $this->slugify(pathinfo($originalName, PATHINFO_FILENAME));
            $relativePath = sprintf(
                '/uploads/training-materials/%s/%s-%s%s',
                $programId,
                date('YmdHis'),
                $safeName,
                $extension !== '' ? '.' . $extension : ''
            );

            $absolutePath = $this->uploadRoot() . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
            $directory = dirname($absolutePath);
            if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
                Response::json(['error' => 'Failed to prepare upload directory'], 500);
            }

            if (!move_uploaded_file($tmpName, $absolutePath)) {
                Response::json(['error' => 'Failed to store uploaded file'], 500);
            }

            $fileUrl = $this->publicUrlFor($relativePath);
            $fileType = $extension !== '' ? $extension : null;
        }

        $id = Auth::uuidV4();
        $statement = $this->pdo->prepare(
            'INSERT INTO training_resources (
                id, program_id, title, description, file_url, file_type, external_url, uploaded_by, created_at, updated_at
             ) VALUES (
                :id, :program_id, :title, :description, :file_url, :file_type, :external_url, :uploaded_by, NOW(), NOW()
             )'
        );
        $statement->execute([
            'id' => $id,
            'program_id' => $programId,
            'title' => $title,
            'description' => $description,
            'file_url' => $fileUrl,
            'file_type' => $fileType,
            'external_url' => $externalUrl,
            'uploaded_by' => $user['id'],
        ]);

        Response::json([
            'message' => 'Resource added',
            'id' => $id,
        ], 201);
    }

    public function delete(string $resourceId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT tr.id, tr.file_url, tp.trainer_id
             FROM training_resources tr
             INNER JOIN training_programs tp ON tp.id = tr.program_id
             WHERE tr.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $resourceId]);
        $resource = $statement->fetch();

        if (!is_array($resource)) {
            Response::json(['error' => 'Resource not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $resource['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $deleteStatement = $this->pdo->prepare('DELETE FROM training_resources WHERE id = :id');
        $deleteStatement->execute(['id' => $resourceId]);

        $this->deleteLocalFile((string) ($resource['file_url'] ?? ''));

        Response::json([
            'message' => 'Resource deleted',
        ]);
    }

    /**
     * @return array<string, array{id: string, title: string}>|array{}
     */
    private function accessiblePrograms(string $userId, string $role): array
    {
        if ($role === 'admin') {
            $rows = $this->fetchPrograms(
                'SELECT id, title
                 FROM training_programs
                 ORDER BY title ASC'
            );

            return $this->indexPrograms($rows);
        }

        if ($role === 'trainer') {
            $rows = $this->fetchPrograms(
                'SELECT id, title
                 FROM training_programs
                 WHERE trainer_id = :trainer_id
                 ORDER BY title ASC',
                ['trainer_id' => $userId]
            );

            return $this->indexPrograms($rows);
        }

        $rows = $this->fetchPrograms(
            'SELECT tp.id, tp.title
             FROM training_programs tp
             INNER JOIN enrollments e ON e.program_id = tp.id
             WHERE e.trainee_id = :trainee_id
               AND e.status = :status
             ORDER BY tp.title ASC',
            [
                'trainee_id' => $userId,
                'status' => 'approved',
            ]
        );

        return $this->indexPrograms($rows);
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<string, array{id: string, title: string}>
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
            ];
        }

        return $indexed;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetchPrograms(string $sql, array $params = []): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findProgram(string $programId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, trainer_id
             FROM training_programs
             WHERE id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $programId]);
        $program = $statement->fetch();

        return is_array($program) ? $program : null;
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

    private function uploadRoot(): string
    {
        return dirname(__DIR__, 2);
    }

    private function publicUrlFor(string $relativePath): string
    {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

        return sprintf('%s://%s%s%s', $scheme, $host, $basePath, $relativePath);
    }

    private function deleteLocalFile(string $fileUrl): void
    {
        if ($fileUrl === '') {
            return;
        }

        $path = (string) parse_url($fileUrl, PHP_URL_PATH);
        $uploadsPosition = strpos($path, '/uploads/');
        if ($uploadsPosition === false) {
            return;
        }

        $relativePath = substr($path, $uploadsPosition);
        $absolutePath = realpath($this->uploadRoot() . str_replace('/', DIRECTORY_SEPARATOR, $relativePath));
        $uploadRoot = realpath($this->uploadRoot() . DIRECTORY_SEPARATOR . 'uploads');

        if ($absolutePath === false || $uploadRoot === false || !str_starts_with($absolutePath, $uploadRoot)) {
            return;
        }

        if (is_file($absolutePath)) {
            @unlink($absolutePath);
        }
    }

    private function slugify(string $value): string
    {
        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $value) ?? 'resource');
        $slug = trim($slug, '-');

        return $slug !== '' ? $slug : 'resource';
    }
}
