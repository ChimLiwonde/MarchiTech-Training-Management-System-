<?php

declare(strict_types=1);

namespace MarchiTech\Api;

final class Request
{
    public static function rawBody(): string
    {
        $raw = file_get_contents('php://input');
        return $raw === false ? '' : $raw;
    }

    /**
     * @return array<string, mixed>
     */
    public static function json(): array
    {
        $raw = self::rawBody();
        if ($raw === false || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    public static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if ($header === '' || !preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
            return null;
        }

        return trim($matches[1]);
    }
}
