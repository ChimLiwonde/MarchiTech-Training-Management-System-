<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Response;
use PDO;

final class DashboardController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function overview(): void
    {
        $user = $this->auth->requireUser();
        $userId = (string) ($user['id'] ?? '');
        $role = (string) ($user['role'] ?? 'trainee');
        $programIds = $this->getScopedProgramIds($userId, $role);

        Response::json([
            'quick_stats' => $this->quickStats($userId, $role, $programIds),
            'attendance_stats' => $this->attendanceStats($userId, $role, $programIds),
            'activities' => $this->recentActivities($userId, $role),
            'upcoming_sessions' => $this->upcomingSessions($userId, $role, $programIds),
            'enrollment_chart' => $this->enrollmentChart($userId, $role, $programIds),
            'pass_rate_chart' => $this->passRateChart($userId, $role),
            'program_progress' => $this->programProgress($userId, $role, $programIds),
        ]);
    }

    /**
     * @param list<string> $programIds
     * @return list<array<string, mixed>>
     */
    private function quickStats(string $userId, string $role, array $programIds): array
    {
        if ($role === 'admin') {
            return [
                [
                    'label' => 'Total Users',
                    'value' => $this->fetchCount('SELECT COUNT(*) AS total FROM profiles'),
                    'path' => '/users',
                ],
                [
                    'label' => 'Active Trainings',
                    'value' => $this->fetchCount(
                        'SELECT COUNT(*) AS total FROM training_programs WHERE status = :status',
                        ['status' => 'active']
                    ),
                    'path' => '/trainings',
                ],
                [
                    'label' => 'Sessions Today',
                    'value' => $this->fetchCount('SELECT COUNT(*) AS total FROM sessions WHERE session_date = CURDATE()'),
                    'path' => '/sessions',
                ],
                [
                    'label' => 'Certificates Issued',
                    'value' => $this->fetchCount('SELECT COUNT(*) AS total FROM certificates'),
                    'path' => '/certificates',
                ],
            ];
        }

        if ($role === 'trainer') {
            $certificateCount = 0;
            $sessionCount = 0;
            $traineeCount = 0;

            if ($programIds !== []) {
                [$inClause, $params] = $this->buildInClause($programIds, 'program_');
                $certificateCount = $this->fetchCount(
                    "SELECT COUNT(*) AS total FROM certificates WHERE program_id IN ({$inClause})",
                    $params
                );
                $sessionCount = $this->fetchCount(
                    "SELECT COUNT(*) AS total FROM sessions WHERE session_date >= CURDATE() AND program_id IN ({$inClause})",
                    $params
                );
                $traineeCount = $this->fetchCount(
                    "SELECT COUNT(*) AS total FROM enrollments WHERE status = :status AND program_id IN ({$inClause})",
                    ['status' => 'approved', ...$params]
                );
            }

            return [
                [
                    'label' => 'My Trainings',
                    'value' => count($programIds),
                    'path' => '/trainings',
                ],
                [
                    'label' => 'Total Trainees',
                    'value' => $traineeCount,
                    'path' => '/users',
                ],
                [
                    'label' => 'Upcoming Sessions',
                    'value' => $sessionCount,
                    'path' => '/sessions',
                ],
                [
                    'label' => 'Certificates Issued',
                    'value' => $certificateCount,
                    'path' => '/certificates',
                ],
            ];
        }

        $upcomingCount = 0;
        if ($programIds !== []) {
            [$inClause, $params] = $this->buildInClause($programIds, 'program_');
            $upcomingCount = $this->fetchCount(
                "SELECT COUNT(*) AS total FROM sessions WHERE session_date >= CURDATE() AND program_id IN ({$inClause})",
                $params
            );
        }

        return [
            [
                'label' => 'Enrolled Programs',
                'value' => $this->fetchCount(
                    'SELECT COUNT(*) AS total FROM enrollments WHERE trainee_id = :trainee_id AND status = :status',
                    ['trainee_id' => $userId, 'status' => 'approved']
                ),
                'path' => '/trainings',
            ],
            [
                'label' => 'Upcoming Sessions',
                'value' => $upcomingCount,
                'path' => '/sessions',
            ],
            [
                'label' => 'Assessments Passed',
                'value' => $this->fetchCount(
                    'SELECT COUNT(*) AS total FROM assessment_attempts WHERE trainee_id = :trainee_id AND passed = 1',
                    ['trainee_id' => $userId]
                ),
                'path' => '/assessments',
            ],
            [
                'label' => 'Certificates',
                'value' => $this->fetchCount(
                    'SELECT COUNT(*) AS total FROM certificates WHERE trainee_id = :trainee_id',
                    ['trainee_id' => $userId]
                ),
                'path' => '/certificates',
            ],
        ];
    }

    /**
     * @param list<string> $programIds
     * @return list<array<string, mixed>>
     */
    private function attendanceStats(string $userId, string $role, array $programIds): array
    {
        if ($role !== 'admin' && $programIds === []) {
            return [];
        }

        $sql = 'SELECT tp.id AS program_id, tp.title AS program_title,
                       COUNT(a.id) AS total_records,
                       SUM(CASE WHEN a.status IN (\'present\', \'late\') THEN 1 ELSE 0 END) AS present_count
                FROM attendance a
                INNER JOIN sessions s ON s.id = a.session_id
                INNER JOIN training_programs tp ON tp.id = s.program_id';
        $clauses = [];
        $params = [];

        if ($role === 'trainer' || $role === 'trainee') {
            [$inClause, $inParams] = $this->buildInClause($programIds, 'program_');
            $clauses[] = "tp.id IN ({$inClause})";
            $params = [...$params, ...$inParams];
        }

        if ($role === 'trainee') {
            $clauses[] = 'a.trainee_id = :trainee_id';
            $params['trainee_id'] = $userId;
        }

        if ($clauses !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $clauses);
        }

        $sql .= ' GROUP BY tp.id, tp.title ORDER BY present_count DESC, total_records DESC, tp.title ASC';

        $rows = $this->fetchAll($sql, $params);

        return array_map(static function (array $row): array {
            $total = (int) ($row['total_records'] ?? 0);
            $present = (int) ($row['present_count'] ?? 0);

            return [
                'programTitle' => $row['program_title'] ?? 'Unknown',
                'totalRecords' => $total,
                'presentCount' => $present,
                'rate' => $total > 0 ? (int) round(($present / $total) * 100) : 0,
            ];
        }, $rows);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function recentActivities(string $userId, string $role): array
    {
        $activities = [];

        $enrollmentSql = 'SELECT e.id, e.status, e.enrolled_at AS timestamp, tp.title AS program_title
                          FROM enrollments e
                          INNER JOIN training_programs tp ON tp.id = e.program_id';
        $enrollmentParams = [];
        if ($role === 'trainer') {
            $enrollmentSql .= ' WHERE tp.trainer_id = :user_id';
            $enrollmentParams['user_id'] = $userId;
        } elseif ($role === 'trainee') {
            $enrollmentSql .= ' WHERE e.trainee_id = :user_id';
            $enrollmentParams['user_id'] = $userId;
        }
        $enrollmentSql .= ' ORDER BY e.enrolled_at DESC LIMIT 5';

        foreach ($this->fetchAll($enrollmentSql, $enrollmentParams) as $row) {
            $activities[] = [
                'id' => 'enr-' . $row['id'],
                'type' => 'enrollment',
                'description' => sprintf('New enrollment in "%s" (%s)', $row['program_title'] ?? 'Unknown', $row['status'] ?? 'pending'),
                'timestamp' => $row['timestamp'],
            ];
        }

        $certificateSql = 'SELECT c.id, c.certificate_number, c.issued_at AS timestamp, tp.title AS program_title
                           FROM certificates c
                           INNER JOIN training_programs tp ON tp.id = c.program_id';
        $certificateParams = [];
        if ($role === 'trainer') {
            $certificateSql .= ' WHERE tp.trainer_id = :user_id';
            $certificateParams['user_id'] = $userId;
        } elseif ($role === 'trainee') {
            $certificateSql .= ' WHERE c.trainee_id = :user_id';
            $certificateParams['user_id'] = $userId;
        }
        $certificateSql .= ' ORDER BY c.issued_at DESC LIMIT 5';

        foreach ($this->fetchAll($certificateSql, $certificateParams) as $row) {
            $activities[] = [
                'id' => 'cert-' . $row['id'],
                'type' => 'certificate',
                'description' => sprintf('Certificate %s issued for "%s"', $row['certificate_number'] ?? 'N/A', $row['program_title'] ?? 'Unknown'),
                'timestamp' => $row['timestamp'],
            ];
        }

        $attemptSql = 'SELECT aa.id, aa.completed_at AS timestamp, aa.passed, aa.score, a.title AS assessment_title
                       FROM assessment_attempts aa
                       INNER JOIN assessments a ON a.id = aa.assessment_id
                       INNER JOIN training_programs tp ON tp.id = a.program_id
                       WHERE aa.completed_at IS NOT NULL';
        $attemptParams = [];
        if ($role === 'trainer') {
            $attemptSql .= ' AND tp.trainer_id = :user_id';
            $attemptParams['user_id'] = $userId;
        } elseif ($role === 'trainee') {
            $attemptSql .= ' AND aa.trainee_id = :user_id';
            $attemptParams['user_id'] = $userId;
        }
        $attemptSql .= ' ORDER BY aa.completed_at DESC LIMIT 5';

        foreach ($this->fetchAll($attemptSql, $attemptParams) as $row) {
            $resultLabel = ((int) ($row['passed'] ?? 0)) === 1 ? 'Passed' : 'Failed';
            $scoreLabel = $row['score'] !== null ? sprintf('%s%%', $row['score']) : 'N/A';
            $activities[] = [
                'id' => 'att-' . $row['id'],
                'type' => 'assessment',
                'description' => sprintf('Assessment "%s" completed - %s (%s)', $row['assessment_title'] ?? 'Unknown', $resultLabel, $scoreLabel),
                'timestamp' => $row['timestamp'],
            ];
        }

        usort($activities, static fn (array $left, array $right): int => strtotime((string) $right['timestamp']) <=> strtotime((string) $left['timestamp']));

        return array_slice($activities, 0, 10);
    }

    /**
     * @param list<string> $programIds
     * @return list<array<string, mixed>>
     */
    private function upcomingSessions(string $userId, string $role, array $programIds): array
    {
        if ($role !== 'admin' && $programIds === []) {
            return [];
        }

        $sql = 'SELECT s.id, tp.title AS program_title, s.session_date, s.start_time, s.end_time, s.location
                FROM sessions s
                INNER JOIN training_programs tp ON tp.id = s.program_id
                WHERE s.session_date >= CURDATE()
                  AND s.session_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)';
        $params = [];

        if ($role === 'trainer') {
            $sql .= ' AND tp.trainer_id = :user_id';
            $params['user_id'] = $userId;
        } elseif ($role === 'trainee') {
            [$inClause, $inParams] = $this->buildInClause($programIds, 'program_');
            $sql .= " AND s.program_id IN ({$inClause})";
            $params = [...$params, ...$inParams];
        }

        $sql .= ' ORDER BY s.session_date ASC, s.start_time ASC, s.created_at ASC LIMIT 6';

        $rows = $this->fetchAll($sql, $params);

        return array_map(static fn (array $row): array => [
            'id' => $row['id'],
            'programTitle' => $row['program_title'] ?? 'Unknown',
            'sessionDate' => $row['session_date'],
            'startTime' => $row['start_time'],
            'endTime' => $row['end_time'],
            'location' => $row['location'],
        ], $rows);
    }

    /**
     * @param list<string> $programIds
     * @return list<array<string, mixed>>
     */
    private function enrollmentChart(string $userId, string $role, array $programIds): array
    {
        if ($role !== 'admin' && $programIds === []) {
            return [];
        }

        $sql = 'SELECT tp.title AS program_title, COUNT(e.id) AS enrollment_count
                FROM enrollments e
                INNER JOIN training_programs tp ON tp.id = e.program_id
                WHERE e.status = :status';
        $params = ['status' => 'approved'];

        if ($role === 'trainer') {
            $sql .= ' AND tp.trainer_id = :user_id';
            $params['user_id'] = $userId;
        } elseif ($role === 'trainee') {
            [$inClause, $inParams] = $this->buildInClause($programIds, 'program_');
            $sql .= " AND e.program_id IN ({$inClause})";
            $params = [...$params, ...$inParams];
        }

        $sql .= ' GROUP BY e.program_id, tp.title ORDER BY enrollment_count DESC, tp.title ASC LIMIT 6';

        return array_map(function (array $row): array {
            $label = (string) ($row['program_title'] ?? 'Unknown');
            $shortLabel = function_exists('mb_substr') ? mb_substr($label, 0, 20) : substr($label, 0, 20);

            return [
                'name' => $shortLabel,
                'count' => (int) ($row['enrollment_count'] ?? 0),
            ];
        }, $this->fetchAll($sql, $params));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function passRateChart(string $userId, string $role): array
    {
        $sql = 'SELECT
                    SUM(CASE WHEN aa.passed = 1 THEN 1 ELSE 0 END) AS passed_count,
                    SUM(CASE WHEN aa.passed = 0 THEN 1 ELSE 0 END) AS failed_count
                FROM assessment_attempts aa
                INNER JOIN assessments a ON a.id = aa.assessment_id
                INNER JOIN training_programs tp ON tp.id = a.program_id
                WHERE aa.completed_at IS NOT NULL';
        $params = [];

        if ($role === 'trainer') {
            $sql .= ' AND tp.trainer_id = :user_id';
            $params['user_id'] = $userId;
        } elseif ($role === 'trainee') {
            $sql .= ' AND aa.trainee_id = :user_id';
            $params['user_id'] = $userId;
        }

        $row = $this->fetchOne($sql, $params) ?? [];

        return [
            ['name' => 'Passed', 'value' => (int) ($row['passed_count'] ?? 0)],
            ['name' => 'Failed', 'value' => (int) ($row['failed_count'] ?? 0)],
        ];
    }

    /**
     * @param list<string> $programIds
     * @return list<array<string, mixed>>
     */
    private function programProgress(string $userId, string $role, array $programIds): array
    {
        if ($programIds === []) {
            return [];
        }

        if ($role === 'trainee') {
            [$programInClause, $programParams] = $this->buildInClause($programIds, 'program_');
            $programRows = $this->fetchAll(
                "SELECT id, title FROM training_programs WHERE id IN ({$programInClause})",
                $programParams
            );
            $assessmentRows = $this->fetchAll(
                "SELECT id, program_id FROM assessments WHERE is_published = 1 AND program_id IN ({$programInClause})",
                $programParams
            );
            $passedAttemptRows = $this->fetchAll(
                'SELECT assessment_id FROM assessment_attempts WHERE trainee_id = :trainee_id AND passed = 1',
                ['trainee_id' => $userId]
            );
            $certificateRows = $this->fetchAll(
                'SELECT program_id FROM certificates WHERE trainee_id = :trainee_id',
                ['trainee_id' => $userId]
            );

            $titleMap = [];
            foreach ($programRows as $row) {
                $titleMap[$row['id']] = $row['title'];
            }

            $programAssessments = [];
            foreach ($assessmentRows as $row) {
                $programAssessments[$row['program_id']] ??= [];
                $programAssessments[$row['program_id']][] = $row['id'];
            }

            $passedSet = [];
            foreach ($passedAttemptRows as $row) {
                $passedSet[$row['assessment_id']] = true;
            }

            $certificateSet = [];
            foreach ($certificateRows as $row) {
                $certificateSet[$row['program_id']] = true;
            }

            $progress = [];
            foreach ($programIds as $programId) {
                $assessmentIds = $programAssessments[$programId] ?? [];
                $total = count($assessmentIds);
                $passed = 0;
                foreach ($assessmentIds as $assessmentId) {
                    if (($passedSet[$assessmentId] ?? false) === true) {
                        $passed++;
                    }
                }

                $progress[] = [
                    'programId' => $programId,
                    'programTitle' => $titleMap[$programId] ?? 'Unknown',
                    'totalAssessments' => $total,
                    'passedAssessments' => $passed,
                    'hasCertificate' => ($certificateSet[$programId] ?? false) === true,
                    'percentage' => $total > 0 ? (int) round(($passed / $total) * 100) : 0,
                ];
            }

            return $progress;
        }

        [$programInClause, $programParams] = $this->buildInClause($programIds, 'program_');
        $programRows = $this->fetchAll(
            "SELECT id, title FROM training_programs WHERE id IN ({$programInClause})",
            $programParams
        );
        $assessmentRows = $this->fetchAll(
            "SELECT id, program_id FROM assessments WHERE is_published = 1 AND program_id IN ({$programInClause})",
            $programParams
        );
        $enrollmentRows = $this->fetchAll(
            "SELECT program_id, trainee_id FROM enrollments WHERE status = :status AND program_id IN ({$programInClause})",
            ['status' => 'approved', ...$programParams]
        );

        $assessmentIds = array_map(static fn (array $row): string => (string) $row['id'], $assessmentRows);
        $attemptRows = [];
        if ($assessmentIds !== []) {
            [$assessmentInClause, $assessmentParams] = $this->buildInClause($assessmentIds, 'assessment_');
            $attemptRows = $this->fetchAll(
                "SELECT assessment_id, trainee_id FROM assessment_attempts WHERE passed = 1 AND assessment_id IN ({$assessmentInClause})",
                $assessmentParams
            );
        }
        $certificateRows = $this->fetchAll(
            "SELECT program_id FROM certificates WHERE program_id IN ({$programInClause})",
            $programParams
        );

        $titleMap = [];
        foreach ($programRows as $row) {
            $titleMap[$row['id']] = $row['title'];
        }

        $programAssessments = [];
        foreach ($assessmentRows as $row) {
            $programAssessments[$row['program_id']] ??= [];
            $programAssessments[$row['program_id']][] = $row['id'];
        }

        $programTrainees = [];
        foreach ($enrollmentRows as $row) {
            $programTrainees[$row['program_id']] ??= [];
            $programTrainees[$row['program_id']][] = $row['trainee_id'];
        }

        $passedMap = [];
        foreach ($attemptRows as $row) {
            $passedMap[$row['trainee_id']] ??= [];
            $passedMap[$row['trainee_id']][$row['assessment_id']] = true;
        }

        $certificateCounts = [];
        foreach ($certificateRows as $row) {
            $certificateCounts[$row['program_id']] = (int) ($certificateCounts[$row['program_id']] ?? 0) + 1;
        }

        $progress = [];
        foreach ($programIds as $programId) {
            $trainees = array_values(array_unique($programTrainees[$programId] ?? []));
            if ($trainees === []) {
                continue;
            }

            $assessmentList = $programAssessments[$programId] ?? [];
            $totalAssessments = count($assessmentList);
            $averagePassed = 0;

            if ($totalAssessments > 0) {
                $sum = 0;
                foreach ($trainees as $traineeId) {
                    $passed = 0;
                    foreach ($assessmentList as $assessmentId) {
                        if (($passedMap[$traineeId][$assessmentId] ?? false) === true) {
                            $passed++;
                        }
                    }
                    $sum += $passed;
                }
                $averagePassed = (int) round($sum / count($trainees));
            }

            $progress[] = [
                'programId' => $programId,
                'programTitle' => $titleMap[$programId] ?? 'Unknown',
                'totalAssessments' => $totalAssessments,
                'passedAssessments' => $averagePassed,
                'hasCertificate' => ((int) ($certificateCounts[$programId] ?? 0)) > 0,
                'percentage' => $totalAssessments > 0 ? (int) round(($averagePassed / $totalAssessments) * 100) : 0,
            ];
        }

        usort($progress, static fn (array $left, array $right): int => ((int) $right['percentage']) <=> ((int) $left['percentage']));

        return $progress;
    }

    /**
     * @return list<string>
     */
    private function getScopedProgramIds(string $userId, string $role): array
    {
        if ($role === 'admin') {
            $rows = $this->fetchAll('SELECT id FROM training_programs ORDER BY created_at DESC');
            return array_map(static fn (array $row): string => (string) $row['id'], $rows);
        }

        if ($role === 'trainer') {
            $rows = $this->fetchAll(
                'SELECT id FROM training_programs WHERE trainer_id = :trainer_id ORDER BY created_at DESC',
                ['trainer_id' => $userId]
            );
            return array_map(static fn (array $row): string => (string) $row['id'], $rows);
        }

        $rows = $this->fetchAll(
            'SELECT program_id FROM enrollments WHERE trainee_id = :trainee_id AND status = :status ORDER BY enrolled_at DESC',
            ['trainee_id' => $userId, 'status' => 'approved']
        );

        return array_values(array_unique(array_map(static fn (array $row): string => (string) $row['program_id'], $rows)));
    }

    private function fetchCount(string $sql, array $params = []): int
    {
        $row = $this->fetchOne($sql, $params);
        return (int) ($row['total'] ?? 0);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetchAll(string $sql, array $params = []): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchOne(string $sql, array $params = []): ?array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();

        return is_array($row) ? $row : null;
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
