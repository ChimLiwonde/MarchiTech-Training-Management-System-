<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class AuthController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function register(): void
    {
        $payload = Request::json();

        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $password = (string) ($payload['password'] ?? '');
        $fullName = trim((string) ($payload['full_name'] ?? ''));
        $role = trim((string) ($payload['role'] ?? 'trainee'));

        if ($email === '' || $password === '' || $fullName === '') {
            Response::json(['error' => 'email, password, and full_name are required'], 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['error' => 'Invalid email address'], 422);
        }

        if (!in_array($role, ['admin', 'trainer', 'trainee'], true)) {
            Response::json(['error' => 'Invalid role'], 422);
        }

        $existing = $this->pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $existing->execute(['email' => $email]);
        if ($existing->fetch() !== false) {
            Response::json(['error' => 'Email already exists'], 409);
        }

        $userId = Auth::uuidV4();
        $profileId = Auth::uuidV4();
        $roleId = Auth::uuidV4();

        $this->pdo->beginTransaction();

        try {
            $userStatement = $this->pdo->prepare(
                'INSERT INTO users (id, email, password_hash, created_at, updated_at)
                 VALUES (:id, :email, :password_hash, NOW(), NOW())'
            );
            $userStatement->execute([
                'id' => $userId,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);

            $profileStatement = $this->pdo->prepare(
                'INSERT INTO profiles (id, user_id, email, full_name, created_at, updated_at)
                 VALUES (:id, :user_id, :email, :full_name, NOW(), NOW())'
            );
            $profileStatement->execute([
                'id' => $profileId,
                'user_id' => $userId,
                'email' => $email,
                'full_name' => $fullName,
            ]);

            $roleStatement = $this->pdo->prepare(
                'INSERT INTO user_roles (id, user_id, role, created_at)
                 VALUES (:id, :user_id, :role, NOW())'
            );
            $roleStatement->execute([
                'id' => $roleId,
                'user_id' => $userId,
                'role' => $role,
            ]);

            $this->pdo->commit();
        } catch (\Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        $token = $this->auth->issueToken($userId);

        Response::json([
            'token' => $token,
            'user' => [
                'id' => $userId,
                'email' => $email,
                'full_name' => $fullName,
                'role' => $role,
            ],
        ], 201);
    }

    public function login(): void
    {
        $payload = Request::json();
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        $password = (string) ($payload['password'] ?? '');

        if ($email === '' || $password === '') {
            Response::json(['error' => 'email and password are required'], 422);
        }

        $statement = $this->pdo->prepare(
            'SELECT u.id, u.email, u.password_hash, p.full_name, ur.role
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
             LEFT JOIN user_roles ur ON ur.user_id = u.id
             WHERE u.email = :email
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();

        if (!is_array($user) || !password_verify($password, (string) $user['password_hash'])) {
            Response::json(['error' => 'Invalid credentials'], 401);
        }

        $token = $this->auth->issueToken((string) $user['id']);

        Response::json([
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'full_name' => $user['full_name'],
                'role' => $user['role'] ?? 'trainee',
            ],
        ]);
    }

    public function me(): void
    {
        $user = $this->auth->requireUser();

        Response::json([
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'full_name' => $user['full_name'],
                'phone' => $user['phone'],
                'avatar_url' => $user['avatar_url'],
                'role' => $user['role'] ?? 'trainee',
            ],
        ]);
    }

    public function logout(): void
    {
        $this->auth->requireUser();
        $this->auth->revokeCurrentToken();

        Response::json(['message' => 'Logged out']);
    }
}
