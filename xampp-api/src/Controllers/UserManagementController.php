<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class UserManagementController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function index(): void
    {
        $user = $this->auth->requireUser();
        if (($user['role'] ?? 'trainee') !== 'admin') {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $profileStatement = $this->pdo->query(
            'SELECT id, user_id, email, full_name, phone, created_at
             FROM profiles
             ORDER BY created_at DESC'
        );
        $profiles = $profileStatement->fetchAll();

        $roleStatement = $this->pdo->query(
            'SELECT user_id, role
             FROM user_roles
             ORDER BY created_at DESC'
        );
        $roles = $roleStatement->fetchAll();
        $rolesByUser = [];
        foreach ($roles as $roleRow) {
            $rolesByUser[(string) $roleRow['user_id']] = (string) $roleRow['role'];
        }

        $users = array_map(
            static function (array $profile) use ($rolesByUser): array {
                $userId = (string) $profile['user_id'];

                return [
                    'id' => (string) $profile['id'],
                    'user_id' => $userId,
                    'email' => (string) $profile['email'],
                    'full_name' => $profile['full_name'],
                    'phone' => $profile['phone'],
                    'created_at' => (string) $profile['created_at'],
                    'role' => $rolesByUser[$userId] ?? null,
                ];
            },
            $profiles
        );

        Response::json([
            'data' => $users,
            'summary' => [
                'total' => count($users),
                'admins' => count(array_filter($users, static fn (array $row): bool => $row['role'] === 'admin')),
                'trainers' => count(array_filter($users, static fn (array $row): bool => $row['role'] === 'trainer')),
                'trainees' => count(array_filter($users, static fn (array $row): bool => $row['role'] === 'trainee')),
            ],
        ]);
    }

    public function updateRole(string $targetUserId): void
    {
        $user = $this->auth->requireUser();
        if (($user['role'] ?? 'trainee') !== 'admin') {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $payload = Request::json();
        $role = trim((string) ($payload['role'] ?? ''));
        if (!in_array($role, ['admin', 'trainer', 'trainee'], true)) {
            Response::json(['error' => 'Invalid role'], 422);
        }

        $userStatement = $this->pdo->prepare(
            'SELECT id
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $userStatement->execute(['id' => $targetUserId]);
        if ($userStatement->fetch() === false) {
            Response::json(['error' => 'User not found'], 404);
        }

        $existingRoleStatement = $this->pdo->prepare(
            'SELECT id
             FROM user_roles
             WHERE user_id = :user_id
             LIMIT 1'
        );
        $existingRoleStatement->execute(['user_id' => $targetUserId]);
        $existingRole = $existingRoleStatement->fetch();

        if (is_array($existingRole)) {
            $updateStatement = $this->pdo->prepare(
                'UPDATE user_roles
                 SET role = :role
                 WHERE user_id = :user_id'
            );
            $updateStatement->execute([
                'role' => $role,
                'user_id' => $targetUserId,
            ]);
        } else {
            $insertStatement = $this->pdo->prepare(
                'INSERT INTO user_roles (id, user_id, role, created_at)
                 VALUES (:id, :user_id, :role, NOW())'
            );
            $insertStatement->execute([
                'id' => Auth::uuidV4(),
                'user_id' => $targetUserId,
                'role' => $role,
            ]);
        }

        Response::json([
            'message' => 'User role updated successfully',
            'role' => $role,
        ]);
    }
}
