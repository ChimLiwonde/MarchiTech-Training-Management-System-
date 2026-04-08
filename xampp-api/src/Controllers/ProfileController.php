<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class ProfileController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function show(): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'SELECT id, user_id, email, full_name, avatar_url, phone, created_at, updated_at
             FROM profiles
             WHERE user_id = :user_id
             LIMIT 1'
        );
        $statement->execute([
            'user_id' => $user['id'],
        ]);
        $profile = $statement->fetch();

        if (!is_array($profile)) {
            Response::json(['error' => 'Profile not found'], 404);
        }

        Response::json([
            'data' => [
                'id' => (string) $profile['id'],
                'user_id' => (string) $profile['user_id'],
                'email' => (string) $profile['email'],
                'full_name' => $profile['full_name'],
                'avatar_url' => $profile['avatar_url'],
                'phone' => $profile['phone'],
                'created_at' => (string) $profile['created_at'],
                'updated_at' => (string) $profile['updated_at'],
                'role' => $user['role'] ?? 'trainee',
            ],
        ]);
    }

    public function update(): void
    {
        $user = $this->auth->requireUser();
        $payload = Request::json();

        $fullName = trim((string) ($payload['full_name'] ?? ''));
        $phone = trim((string) ($payload['phone'] ?? ''));

        $statement = $this->pdo->prepare(
            'UPDATE profiles
             SET full_name = :full_name, phone = :phone, updated_at = NOW()
             WHERE user_id = :user_id'
        );
        $statement->execute([
            'full_name' => $fullName !== '' ? $fullName : null,
            'phone' => $phone !== '' ? $phone : null,
            'user_id' => $user['id'],
        ]);

        Response::json([
            'message' => 'Profile updated successfully',
        ]);
    }
}
