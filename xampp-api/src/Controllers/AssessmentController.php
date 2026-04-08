<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Request;
use MarchiTech\Api\Response;
use PDO;

final class AssessmentController
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
        $programs = $this->accessiblePrograms($user['id'], $role);

        if ($programs === []) {
            Response::json([
                'data' => [],
                'programs' => [],
                'attempts' => [],
            ]);
        }

        [$inClause, $params] = $this->buildInClause(array_keys($programs), 'program_');

        $assessmentSql = "SELECT a.*
                          FROM assessments a
                          WHERE a.program_id IN ({$inClause})";
        if ($role === 'trainee') {
            $assessmentSql .= ' AND a.is_published = 1';
        }
        $assessmentSql .= ' ORDER BY a.created_at DESC';

        $assessmentStatement = $this->pdo->prepare($assessmentSql);
        $assessmentStatement->execute($params);
        $assessments = array_map(
            fn (array $row): array => $this->mapAssessment($row),
            $assessmentStatement->fetchAll()
        );

        $attempts = [];
        if ($role === 'trainee') {
            $attemptStatement = $this->pdo->prepare(
                'SELECT id, assessment_id, score, passed, completed_at
                 FROM assessment_attempts
                 WHERE trainee_id = :trainee_id
                 ORDER BY completed_at DESC, created_at DESC'
            );
            $attemptStatement->execute([
                'trainee_id' => $user['id'],
            ]);
            $attempts = array_map(
                static fn (array $row): array => [
                    'id' => (string) $row['id'],
                    'assessment_id' => (string) $row['assessment_id'],
                    'score' => $row['score'] !== null ? (int) $row['score'] : null,
                    'passed' => $row['passed'] !== null ? (bool) $row['passed'] : null,
                    'completed_at' => $row['completed_at'],
                ],
                $attemptStatement->fetchAll()
            );
        }

        Response::json([
            'data' => $assessments,
            'programs' => array_values($programs),
            'attempts' => $attempts,
        ]);
    }

    public function create(): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $payload = Request::json();
        $programId = trim((string) ($payload['program_id'] ?? ''));
        $title = trim((string) ($payload['title'] ?? ''));
        $description = trim((string) ($payload['description'] ?? '')) ?: null;
        $passingScore = (int) ($payload['passing_score'] ?? 70);

        if ($programId === '' || $title === '') {
            Response::json(['error' => 'program_id and title are required'], 422);
        }

        if ($passingScore < 0 || $passingScore > 100) {
            Response::json(['error' => 'passing_score must be between 0 and 100'], 422);
        }

        $program = $this->findProgram($programId);
        if ($program === null) {
            Response::json(['error' => 'Training program not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $program['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $id = Auth::uuidV4();
        $statement = $this->pdo->prepare(
            'INSERT INTO assessments (
                id, program_id, title, description, passing_score, created_by, created_at, updated_at
             ) VALUES (
                :id, :program_id, :title, :description, :passing_score, :created_by, NOW(), NOW()
             )'
        );
        $statement->execute([
            'id' => $id,
            'program_id' => $programId,
            'title' => $title,
            'description' => $description,
            'passing_score' => $passingScore,
            'created_by' => $user['id'],
        ]);

        Response::json([
            'message' => 'Assessment created',
            'id' => $id,
        ], 201);
    }

    public function updatePublish(string $assessmentId): void
    {
        $user = $this->auth->requireUser();
        $assessment = $this->requireManageableAssessment($assessmentId, $user);

        $payload = Request::json();
        $isPublished = array_key_exists('is_published', $payload)
            ? (bool) $payload['is_published']
            : !(bool) $assessment['is_published'];

        $statement = $this->pdo->prepare(
            'UPDATE assessments
             SET is_published = :is_published, updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            'is_published' => $isPublished ? 1 : 0,
            'id' => $assessmentId,
        ]);

        Response::json([
            'message' => 'Assessment publish status updated',
            'is_published' => $isPublished,
        ]);
    }

    public function delete(string $assessmentId): void
    {
        $user = $this->auth->requireUser();
        $this->requireManageableAssessment($assessmentId, $user);

        $statement = $this->pdo->prepare('DELETE FROM assessments WHERE id = :id');
        $statement->execute(['id' => $assessmentId]);

        Response::json([
            'message' => 'Assessment deleted',
        ]);
    }

    public function questions(string $assessmentId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';
        $assessment = $this->requireAccessibleAssessment($assessmentId, $user, $role === 'trainee');

        $selectColumns = $role === 'trainee'
            ? 'id, assessment_id, question_text, options, points, sort_order'
            : 'id, assessment_id, question_text, options, correct_answer, points, sort_order';

        $statement = $this->pdo->prepare(
            "SELECT {$selectColumns}
             FROM assessment_questions
             WHERE assessment_id = :assessment_id
             ORDER BY sort_order ASC, created_at ASC"
        );
        $statement->execute([
            'assessment_id' => $assessmentId,
        ]);

        Response::json([
            'data' => array_map(
                fn (array $row): array => $this->mapQuestion($row, $role !== 'trainee'),
                $statement->fetchAll()
            ),
            'assessment' => $this->mapAssessment($assessment),
        ]);
    }

    public function addQuestion(string $assessmentId): void
    {
        $user = $this->auth->requireUser();
        $this->requireManageableAssessment($assessmentId, $user);

        $payload = Request::json();
        $questionText = trim((string) ($payload['question_text'] ?? ''));
        $options = is_array($payload['options'] ?? null) ? array_values($payload['options']) : [];
        $correctAnswer = trim((string) ($payload['correct_answer'] ?? ''));
        $points = max(1, (int) ($payload['points'] ?? 1));
        $sortOrder = max(0, (int) ($payload['sort_order'] ?? 0));

        $normalizedOptions = [];
        foreach ($options as $option) {
            $value = trim((string) $option);
            if ($value !== '') {
                $normalizedOptions[] = $value;
            }
        }

        if ($questionText === '' || count($normalizedOptions) < 2 || $correctAnswer === '') {
            Response::json(['error' => 'question_text, at least two options, and correct_answer are required'], 422);
        }

        if (!in_array($correctAnswer, $normalizedOptions, true)) {
            Response::json(['error' => 'correct_answer must match one of the options'], 422);
        }

        $id = Auth::uuidV4();
        $statement = $this->pdo->prepare(
            'INSERT INTO assessment_questions (
                id, assessment_id, question_text, options, correct_answer, points, sort_order, created_at
             ) VALUES (
                :id, :assessment_id, :question_text, :options, :correct_answer, :points, :sort_order, NOW()
             )'
        );
        $statement->execute([
            'id' => $id,
            'assessment_id' => $assessmentId,
            'question_text' => $questionText,
            'options' => json_encode($normalizedOptions, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'correct_answer' => $correctAnswer,
            'points' => $points,
            'sort_order' => $sortOrder,
        ]);

        Response::json([
            'message' => 'Question added',
            'id' => $id,
        ], 201);
    }

    public function deleteQuestion(string $questionId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT aq.id, a.program_id, tp.trainer_id
             FROM assessment_questions aq
             INNER JOIN assessments a ON a.id = aq.assessment_id
             INNER JOIN training_programs tp ON tp.id = a.program_id
             WHERE aq.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $questionId]);
        $question = $statement->fetch();

        if (!is_array($question)) {
            Response::json(['error' => 'Question not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $question['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $deleteStatement = $this->pdo->prepare('DELETE FROM assessment_questions WHERE id = :id');
        $deleteStatement->execute(['id' => $questionId]);

        Response::json([
            'message' => 'Question deleted',
        ]);
    }

    public function submitAttempt(string $assessmentId): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'trainee') {
            Response::json(['error' => 'Only trainees can submit attempts'], 403);
        }

        $assessment = $this->requireAccessibleAssessment($assessmentId, $user, true);

        $questionStatement = $this->pdo->prepare(
            'SELECT id, correct_answer, points
             FROM assessment_questions
             WHERE assessment_id = :assessment_id
             ORDER BY sort_order ASC, created_at ASC'
        );
        $questionStatement->execute([
            'assessment_id' => $assessmentId,
        ]);
        $questions = $questionStatement->fetchAll();

        if ($questions === []) {
            Response::json(['error' => 'This assessment has no questions yet'], 422);
        }

        $payload = Request::json();
        $answers = is_array($payload['answers'] ?? null) ? $payload['answers'] : [];

        $earnedPoints = 0;
        $totalPoints = 0;
        foreach ($questions as $question) {
            $points = max(1, (int) ($question['points'] ?? 1));
            $totalPoints += $points;

            $answer = trim((string) ($answers[$question['id']] ?? ''));
            if ($answer !== '' && $answer === (string) $question['correct_answer']) {
                $earnedPoints += $points;
            }
        }

        $score = $totalPoints > 0
            ? (int) round(($earnedPoints / $totalPoints) * 100)
            : 0;
        $passed = $score >= (int) ($assessment['passing_score'] ?? 70);

        $statement = $this->pdo->prepare(
            'INSERT INTO assessment_attempts (
                id, assessment_id, trainee_id, answers, score, passed, completed_at, created_at
             ) VALUES (
                :id, :assessment_id, :trainee_id, :answers, :score, :passed, NOW(), NOW()
             )'
        );
        $statement->execute([
            'id' => Auth::uuidV4(),
            'assessment_id' => $assessmentId,
            'trainee_id' => $user['id'],
            'answers' => json_encode($answers, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'score' => $score,
            'passed' => $passed ? 1 : 0,
        ]);

        Response::json([
            'message' => 'Attempt submitted',
            'score' => $score,
            'passed' => $passed,
            'earned_points' => $earnedPoints,
            'total_points' => $totalPoints,
        ], 201);
    }

    /**
     * @return array<string, array{id: string, title: string}>|array{}
     */
    private function accessiblePrograms(string $userId, string $role): array
    {
        if ($role === 'admin') {
            $statement = $this->pdo->query(
                'SELECT id, title
                 FROM training_programs
                 ORDER BY title ASC'
            );

            return $this->indexPrograms($statement->fetchAll());
        }

        if ($role === 'trainer') {
            $statement = $this->pdo->prepare(
                'SELECT id, title
                 FROM training_programs
                 WHERE trainer_id = :trainer_id
                 ORDER BY title ASC'
            );
            $statement->execute(['trainer_id' => $userId]);

            return $this->indexPrograms($statement->fetchAll());
        }

        $statement = $this->pdo->prepare(
            'SELECT tp.id, tp.title
             FROM training_programs tp
             INNER JOIN enrollments e ON e.program_id = tp.id
             WHERE e.trainee_id = :trainee_id
               AND e.status = :status
             ORDER BY tp.title ASC'
        );
        $statement->execute([
            'trainee_id' => $userId,
            'status' => 'approved',
        ]);

        return $this->indexPrograms($statement->fetchAll());
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
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function requireManageableAssessment(string $assessmentId, array $user): array
    {
        $role = $user['role'] ?? 'trainee';
        if (!in_array($role, ['admin', 'trainer'], true)) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $statement = $this->pdo->prepare(
            'SELECT a.*, tp.trainer_id
             FROM assessments a
             INNER JOIN training_programs tp ON tp.id = a.program_id
             WHERE a.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $assessmentId]);
        $assessment = $statement->fetch();

        if (!is_array($assessment)) {
            Response::json(['error' => 'Assessment not found'], 404);
        }

        $isOwnerTrainer = $role === 'trainer' && $assessment['trainer_id'] === $user['id'];
        if ($role !== 'admin' && !$isOwnerTrainer) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        return $assessment;
    }

    /**
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function requireAccessibleAssessment(string $assessmentId, array $user, bool $mustBePublished): array
    {
        $role = $user['role'] ?? 'trainee';

        $statement = $this->pdo->prepare(
            'SELECT a.*, tp.trainer_id
             FROM assessments a
             INNER JOIN training_programs tp ON tp.id = a.program_id
             WHERE a.id = :id
             LIMIT 1'
        );
        $statement->execute(['id' => $assessmentId]);
        $assessment = $statement->fetch();

        if (!is_array($assessment)) {
            Response::json(['error' => 'Assessment not found'], 404);
        }

        if ($role === 'admin') {
            return $assessment;
        }

        if ($role === 'trainer') {
            if ($assessment['trainer_id'] !== $user['id']) {
                Response::json(['error' => 'Forbidden'], 403);
            }

            return $assessment;
        }

        if ($mustBePublished && !(bool) $assessment['is_published']) {
            Response::json(['error' => 'Assessment is not published'], 403);
        }

        $enrollmentStatement = $this->pdo->prepare(
            'SELECT id
             FROM enrollments
             WHERE program_id = :program_id
               AND trainee_id = :trainee_id
               AND status = :status
             LIMIT 1'
        );
        $enrollmentStatement->execute([
            'program_id' => $assessment['program_id'],
            'trainee_id' => $user['id'],
            'status' => 'approved',
        ]);

        if (!is_array($enrollmentStatement->fetch())) {
            Response::json(['error' => 'Forbidden'], 403);
        }

        return $assessment;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function mapAssessment(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'program_id' => (string) $row['program_id'],
            'title' => (string) $row['title'],
            'description' => $row['description'],
            'passing_score' => (int) ($row['passing_score'] ?? 70),
            'time_limit_minutes' => $row['time_limit_minutes'] !== null ? (int) $row['time_limit_minutes'] : null,
            'is_published' => (bool) ($row['is_published'] ?? false),
            'created_by' => (string) ($row['created_by'] ?? ''),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function mapQuestion(array $row, bool $includeCorrectAnswer): array
    {
        $options = json_decode((string) ($row['options'] ?? '[]'), true);
        if (!is_array($options)) {
            $options = [];
        }

        $mapped = [
            'id' => (string) $row['id'],
            'assessment_id' => (string) $row['assessment_id'],
            'question_text' => (string) $row['question_text'],
            'options' => array_values(array_map('strval', $options)),
            'points' => (int) ($row['points'] ?? 1),
            'sort_order' => (int) ($row['sort_order'] ?? 0),
        ];

        if ($includeCorrectAnswer) {
            $mapped['correct_answer'] = (string) ($row['correct_answer'] ?? '');
        }

        return $mapped;
    }
}
