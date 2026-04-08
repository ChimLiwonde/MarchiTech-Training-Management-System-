<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Response;
use PDO;

final class NotificationController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function index(): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'SELECT id, user_id, title, message, type, is_read, link, created_at
             FROM notifications
             WHERE user_id = :user_id
             ORDER BY created_at DESC
             LIMIT 50'
        );
        $statement->execute([
            'user_id' => $user['id'],
        ]);

        Response::json([
            'data' => $statement->fetchAll(),
        ]);
    }

    public function markRead(string $notificationId): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'UPDATE notifications
             SET is_read = 1
             WHERE id = :id
               AND user_id = :user_id'
        );
        $statement->execute([
            'id' => $notificationId,
            'user_id' => $user['id'],
        ]);

        if ($statement->rowCount() === 0) {
            Response::json(['error' => 'Notification not found'], 404);
        }

        Response::json([
            'message' => 'Notification marked as read',
        ]);
    }

    public function markAllRead(): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'UPDATE notifications
             SET is_read = 1
             WHERE user_id = :user_id
               AND is_read = 0'
        );
        $statement->execute([
            'user_id' => $user['id'],
        ]);

        Response::json([
            'message' => 'All notifications marked as read',
        ]);
    }

    public function delete(string $notificationId): void
    {
        $user = $this->auth->requireUser();

        $statement = $this->pdo->prepare(
            'DELETE FROM notifications
             WHERE id = :id
               AND user_id = :user_id'
        );
        $statement->execute([
            'id' => $notificationId,
            'user_id' => $user['id'],
        ]);

        if ($statement->rowCount() === 0) {
            Response::json(['error' => 'Notification not found'], 404);
        }

        Response::json([
            'message' => 'Notification deleted',
        ]);
    }
}
