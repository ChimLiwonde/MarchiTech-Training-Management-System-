<?php

declare(strict_types=1);

namespace MarchiTech\Api;

use PDO;

final class NotificationService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(
        string $userId,
        string $title,
        string $message,
        string $type = 'info',
        ?string $link = null
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, link, created_at)
             VALUES (:id, :user_id, :title, :message, :type, 0, :link, NOW())'
        );
        $statement->execute([
            'id' => Auth::uuidV4(),
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'link' => $link,
        ]);
    }

    /**
     * @param list<string> $userIds
     */
    public function createForUsers(
        array $userIds,
        string $title,
        string $message,
        string $type = 'info',
        ?string $link = null
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, link, created_at)
             VALUES (:id, :user_id, :title, :message, :type, 0, :link, NOW())'
        );

        foreach (array_values(array_unique(array_filter($userIds))) as $userId) {
            if (!is_string($userId) || $userId === '') {
                continue;
            }

            $statement->execute([
                'id' => Auth::uuidV4(),
                'user_id' => $userId,
                'title' => $title,
                'message' => $message,
                'type' => $type,
                'link' => $link,
            ]);
        }
    }
}
