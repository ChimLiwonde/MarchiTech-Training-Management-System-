<?php

declare(strict_types=1);

namespace MarchiTech\Api;

use PDO;
use PDOException;

final class Database
{
    private PDO $pdo;

    /**
     * @param array<string, string> $config
     */
    public function __construct(array $config)
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $config['host'],
            $config['port'],
            $config['database'],
            $config['charset']
        );

        try {
            $this->pdo = new PDO($dsn, $config['username'], $config['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
        } catch (PDOException $exception) {
            throw new PDOException('Database connection failed: ' . $exception->getMessage(), (int) $exception->getCode());
        }
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }
}
