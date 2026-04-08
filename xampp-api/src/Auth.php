<?php

declare(strict_types=1);

namespace MarchiTech\Api;

use PDO;

final class Auth
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array<string, mixed>|null
     */
    public function userFromRequest(): ?array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return null;
        }

        $statement = $this->pdo->prepare(
            'SELECT u.id, u.email, p.full_name, p.phone, p.avatar_url, ur.role
             FROM api_tokens t
             INNER JOIN users u ON u.id = t.user_id
             LEFT JOIN profiles p ON p.user_id = u.id
             LEFT JOIN user_roles ur ON ur.user_id = u.id
             WHERE t.token_hash = :token_hash AND (t.expires_at IS NULL OR t.expires_at > NOW())
             LIMIT 1'
        );
        $statement->execute([
            'token_hash' => hash('sha256', $token),
        ]);

        $user = $statement->fetch();
        return is_array($user) ? $user : null;
    }

    /**
     * @return array<string, mixed>
     */
    public function requireUser(): array
    {
        $user = $this->userFromRequest();
        if ($user === null) {
            Response::json(['error' => 'Unauthorized'], 401);
        }

        return $user;
    }

    public function issueToken(string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $statement = $this->pdo->prepare(
            'INSERT INTO api_tokens (id, user_id, token_hash, created_at)
             VALUES (:id, :user_id, :token_hash, NOW())'
        );
        $statement->execute([
            'id' => self::uuidV4(),
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
        ]);

        return $token;
    }

    public function revokeCurrentToken(): void
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return;
        }

        $statement = $this->pdo->prepare('DELETE FROM api_tokens WHERE token_hash = :token_hash');
        $statement->execute([
            'token_hash' => hash('sha256', $token),
        ]);
    }

    public static function uuidV4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
