<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class FeedbackController
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
        $programs = $this->visiblePrograms($user['id'], $role);

        if ($programs === []) {
            Response::json(['data' => []]);
        }

        $programIds = array_map(
            static fn (array $program): string => (string) $program['id'],
            $programs
        );
        [$inClause, $params] = $this->buildInClause($programIds, 'program_');

        $reviewStatement = $this->pdo->prepare(
            "SELECT id, program_id, trainee_id, rating, comment, created_at
             FROM program_reviews
             WHERE program_id IN ({$inClause})"
        );
        $reviewStatement->execute($params);
        $reviews = $reviewStatement->fetchAll();

        $response = [];
        foreach ($programs as $program) {
            $programId = (string) $program['id'];
            $programReviews = array_values(array_filter(
                $reviews,
                static fn (array $review): bool => (string) $review['program_id'] === $programId
            ));

            $myReview = null;
            if ($role === 'trainee') {
                foreach ($programReviews as $review) {
                    if ((string) $review['trainee_id'] !== $user['id']) {
                        continue;
                    }

                    $myReview = [
                        'id' => (string) $review['id'],
                        'rating' => (int) $review['rating'],
                        'comment' => $review['comment'],
                        'created_at' => (string) $review['created_at'],
                    ];
                    break;
                }
            }

            $reviewCount = count($programReviews);
            $avgRating = $reviewCount > 0
                ? round(array_sum(array_map(static fn (array $review): int => (int) $review['rating'], $programReviews)) / $reviewCount, 1)
                : null;

            $response[] = [
                'id' => $programId,
                'title' => (string) $program['title'],
                'description' => $program['description'],
                'status' => (string) $program['status'],
                'my_review' => $myReview,
                'avg_rating' => $avgRating,
                'review_count' => $reviewCount,
            ];
        }

        Response::json([
            'data' => $response,
        ]);
    }

    public function create(): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'trainee') {
            Response::json(['error' => 'Only trainees can submit reviews'], 403);
        }

        $payload = Request::json();
        $programId = trim((string) ($payload['program_id'] ?? ''));
        $rating = (int) ($payload['rating'] ?? 0);
        $comment = trim((string) ($payload['comment'] ?? '')) ?: null;

        if ($programId === '' || $rating < 1 || $rating > 5) {
            Response::json(['error' => 'program_id and a rating between 1 and 5 are required'], 422);
        }

        if ($comment !== null && mb_strlen($comment) > 1000) {
            Response::json(['error' => 'Comment must be less than 1000 characters'], 422);
        }

        if (!$this->hasApprovedEnrollment($user['id'], $programId)) {
            Response::json(['error' => 'You can only review approved training programs'], 403);
        }

        $existingStatement = $this->pdo->prepare(
            'SELECT id
             FROM program_reviews
             WHERE program_id = :program_id AND trainee_id = :trainee_id
             LIMIT 1'
        );
        $existingStatement->execute([
            'program_id' => $programId,
            'trainee_id' => $user['id'],
        ]);
        if ($existingStatement->fetch() !== false) {
            Response::json(['error' => 'You have already reviewed this program'], 409);
        }

        $statement = $this->pdo->prepare(
            'INSERT INTO program_reviews (id, program_id, trainee_id, rating, comment, created_at, updated_at)
             VALUES (:id, :program_id, :trainee_id, :rating, :comment, NOW(), NOW())'
        );
        $statement->execute([
            'id' => Auth::uuidV4(),
            'program_id' => $programId,
            'trainee_id' => $user['id'],
            'rating' => $rating,
            'comment' => $comment,
        ]);

        Response::json([
            'message' => 'Review submitted successfully',
        ], 201);
    }

    public function update(string $reviewId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'trainee') {
            Response::json(['error' => 'Only trainees can update reviews'], 403);
        }

        $payload = Request::json();
        $rating = (int) ($payload['rating'] ?? 0);
        $comment = trim((string) ($payload['comment'] ?? '')) ?: null;

        if ($rating < 1 || $rating > 5) {
            Response::json(['error' => 'A rating between 1 and 5 is required'], 422);
        }

        if ($comment !== null && mb_strlen($comment) > 1000) {
            Response::json(['error' => 'Comment must be less than 1000 characters'], 422);
        }

        $statement = $this->pdo->prepare(
            'UPDATE program_reviews
             SET rating = :rating, comment = :comment, updated_at = NOW()
             WHERE id = :id AND trainee_id = :trainee_id'
        );
        $statement->execute([
            'rating' => $rating,
            'comment' => $comment,
            'id' => $reviewId,
            'trainee_id' => $user['id'],
        ]);

        if ($statement->rowCount() === 0) {
            Response::json(['error' => 'Review not found'], 404);
        }

        Response::json([
            'message' => 'Review updated successfully',
        ]);
    }

    public function delete(string $reviewId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'trainee') {
            Response::json(['error' => 'Only trainees can delete reviews'], 403);
        }

        $statement = $this->pdo->prepare(
            'DELETE FROM program_reviews
             WHERE id = :id AND trainee_id = :trainee_id'
        );
        $statement->execute([
            'id' => $reviewId,
            'trainee_id' => $user['id'],
        ]);

        if ($statement->rowCount() === 0) {
            Response::json(['error' => 'Review not found'], 404);
        }

        Response::json([
            'message' => 'Review deleted successfully',
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function visiblePrograms(string $userId, string $role): array
    {
        if ($role === 'trainee') {
            $statement = $this->pdo->prepare(
                'SELECT tp.id, tp.title, tp.description, tp.status
                 FROM enrollments e
                 INNER JOIN training_programs tp ON tp.id = e.program_id
                 WHERE e.trainee_id = :trainee_id
                   AND e.status = :status
                 ORDER BY tp.title ASC'
            );
            $statement->execute([
                'trainee_id' => $userId,
                'status' => 'approved',
            ]);

            return $statement->fetchAll();
        }

        $statement = $this->pdo->query(
            'SELECT id, title, description, status
             FROM training_programs
             ORDER BY title ASC'
        );

        return $statement->fetchAll();
    }

    private function hasApprovedEnrollment(string $userId, string $programId): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT id
             FROM enrollments
             WHERE trainee_id = :trainee_id
               AND program_id = :program_id
               AND status = :status
             LIMIT 1'
        );
        $statement->execute([
            'trainee_id' => $userId,
            'program_id' => $programId,
            'status' => 'approved',
        ]);

        return $statement->fetch() !== false;
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
}
