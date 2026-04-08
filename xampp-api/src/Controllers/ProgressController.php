<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Response;
use PDO;

final class ProgressController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function overview(): void
    {
        $user = $this->auth->requireUser();

        $enrollmentStatement = $this->pdo->prepare(
            'SELECT program_id
             FROM enrollments
             WHERE trainee_id = :trainee_id
               AND status = :status
             ORDER BY enrolled_at DESC'
        );
        $enrollmentStatement->execute([
            'trainee_id' => $user['id'],
            'status' => 'approved',
        ]);
        $enrollments = $enrollmentStatement->fetchAll();

        if ($enrollments === []) {
            Response::json([
                'programs' => [],
                'overall' => [
                    'totalPrograms' => 0,
                    'completedPrograms' => 0,
                    'totalSessionsAttended' => 0,
                    'totalAssessmentsPassed' => 0,
                    'totalCertificates' => 0,
                    'averageProgress' => 0,
                ],
            ]);
        }

        $programIds = array_values(array_unique(array_map(
            static fn (array $row): string => (string) $row['program_id'],
            $enrollments
        )));

        [$programInClause, $programParams] = $this->buildInClause($programIds, 'program_');

        $programStatement = $this->pdo->prepare(
            "SELECT id, title, status, start_date, end_date
             FROM training_programs
             WHERE id IN ({$programInClause})"
        );
        $programStatement->execute($programParams);
        $programs = $programStatement->fetchAll();

        $sessionStatement = $this->pdo->prepare(
            "SELECT id, program_id
             FROM sessions
             WHERE program_id IN ({$programInClause})"
        );
        $sessionStatement->execute($programParams);
        $sessions = $sessionStatement->fetchAll();

        $attendanceStatement = $this->pdo->prepare(
            'SELECT session_id, status
             FROM attendance
             WHERE trainee_id = :trainee_id'
        );
        $attendanceStatement->execute([
            'trainee_id' => $user['id'],
        ]);
        $attendance = $attendanceStatement->fetchAll();

        $assessmentStatement = $this->pdo->prepare(
            "SELECT id, program_id
             FROM assessments
             WHERE program_id IN ({$programInClause})
               AND is_published = 1"
        );
        $assessmentStatement->execute($programParams);
        $assessments = $assessmentStatement->fetchAll();

        $attemptStatement = $this->pdo->prepare(
            'SELECT assessment_id, score, passed, completed_at
             FROM assessment_attempts
             WHERE trainee_id = :trainee_id
               AND completed_at IS NOT NULL'
        );
        $attemptStatement->execute([
            'trainee_id' => $user['id'],
        ]);
        $attempts = $attemptStatement->fetchAll();

        $certificateStatement = $this->pdo->prepare(
            'SELECT program_id
             FROM certificates
             WHERE trainee_id = :trainee_id'
        );
        $certificateStatement->execute([
            'trainee_id' => $user['id'],
        ]);
        $certificates = $certificateStatement->fetchAll();

        $sessionsByProgram = [];
        foreach ($sessions as $session) {
            $programId = (string) $session['program_id'];
            $sessionsByProgram[$programId] ??= [];
            $sessionsByProgram[$programId][] = (string) $session['id'];
        }

        $attendedSessionIds = [];
        foreach ($attendance as $record) {
            $status = (string) ($record['status'] ?? '');
            if (!in_array($status, ['present', 'late'], true)) {
                continue;
            }

            $attendedSessionIds[(string) $record['session_id']] = true;
        }

        $assessmentsByProgram = [];
        foreach ($assessments as $assessment) {
            $programId = (string) $assessment['program_id'];
            $assessmentsByProgram[$programId] ??= [];
            $assessmentsByProgram[$programId][] = (string) $assessment['id'];
        }

        $attemptsByAssessment = [];
        foreach ($attempts as $attempt) {
            $assessmentId = (string) $attempt['assessment_id'];
            $attemptsByAssessment[$assessmentId] ??= [];
            $attemptsByAssessment[$assessmentId][] = [
                'score' => $attempt['score'] !== null ? (int) $attempt['score'] : null,
                'passed' => $attempt['passed'] !== null ? (bool) $attempt['passed'] : null,
            ];
        }

        $certificateProgramIds = [];
        foreach ($certificates as $certificate) {
            $certificateProgramIds[(string) $certificate['program_id']] = true;
        }

        $progressData = [];
        foreach ($programs as $program) {
            $programId = (string) $program['id'];
            $programSessionIds = $sessionsByProgram[$programId] ?? [];
            $attendedCount = count(array_filter(
                $programSessionIds,
                static fn (string $sessionId): bool => isset($attendedSessionIds[$sessionId])
            ));
            $attendanceRate = count($programSessionIds) > 0
                ? (int) round(($attendedCount / count($programSessionIds)) * 100)
                : 0;

            $programAssessmentIds = $assessmentsByProgram[$programId] ?? [];
            $passedCount = 0;
            $failedCount = 0;
            $scores = [];

            foreach ($programAssessmentIds as $assessmentId) {
                $assessmentAttempts = $attemptsByAssessment[$assessmentId] ?? [];
                $hasPassed = false;

                foreach ($assessmentAttempts as $attempt) {
                    if ($attempt['passed'] === true) {
                        $hasPassed = true;
                    }

                    if (is_int($attempt['score'])) {
                        $scores[] = $attempt['score'];
                    }
                }

                if ($hasPassed) {
                    $passedCount++;
                } elseif ($assessmentAttempts !== []) {
                    $failedCount++;
                }
            }

            $hasCertificate = isset($certificateProgramIds[$programId]);
            $bestScore = $scores !== [] ? max($scores) : null;
            $averageScore = $scores !== []
                ? (int) round(array_sum($scores) / count($scores))
                : null;

            $attendanceWeight = $attendanceRate * 0.3;
            $assessmentWeight = count($programAssessmentIds) > 0
                ? ($passedCount / count($programAssessmentIds)) * 100 * 0.5
                : ($attendedCount > 0 ? 50 : 0);
            $certificateWeight = $hasCertificate ? 20 : 0;
            $overallProgress = min(100, (int) round($attendanceWeight + $assessmentWeight + $certificateWeight));

            $progressData[] = [
                'programId' => $programId,
                'programTitle' => (string) $program['title'],
                'programStatus' => (string) $program['status'],
                'startDate' => $program['start_date'],
                'endDate' => $program['end_date'],
                'totalSessions' => count($programSessionIds),
                'attendedSessions' => $attendedCount,
                'attendanceRate' => $attendanceRate,
                'totalAssessments' => count($programAssessmentIds),
                'passedAssessments' => $passedCount,
                'failedAssessments' => $failedCount,
                'bestScore' => $bestScore,
                'averageScore' => $averageScore,
                'isEnrolled' => true,
                'hasAttendedFirst' => $attendedCount > 0,
                'hasPassedAssessment' => $passedCount > 0,
                'hasCertificate' => $hasCertificate,
                'overallProgress' => $overallProgress,
            ];
        }

        usort(
            $progressData,
            static fn (array $left, array $right): int => $right['overallProgress'] <=> $left['overallProgress']
        );

        $completedPrograms = count(array_filter(
            $progressData,
            static fn (array $program): bool => $program['hasCertificate'] === true
        ));

        Response::json([
            'programs' => $progressData,
            'overall' => [
                'totalPrograms' => count($progressData),
                'completedPrograms' => $completedPrograms,
                'totalSessionsAttended' => array_sum(array_column($progressData, 'attendedSessions')),
                'totalAssessmentsPassed' => array_sum(array_column($progressData, 'passedAssessments')),
                'totalCertificates' => $completedPrograms,
                'averageProgress' => $progressData !== []
                    ? (int) round(array_sum(array_column($progressData, 'overallProgress')) / count($progressData))
                    : 0,
            ],
        ]);
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
