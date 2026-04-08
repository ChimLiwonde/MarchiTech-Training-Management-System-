<?php

declare(strict_types=1);

namespace MarchiTech\Api\Controllers;

use MarchiTech\Api\Auth;
use MarchiTech\Api\Response;
use PDO;

final class ReportController
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Auth $auth
    ) {
    }

    public function overview(): void
    {
        $user = $this->auth->requireUser();
        $role = $user['role'] ?? 'trainee';

        if ($role !== 'admin') {
            Response::json(['error' => 'Forbidden'], 403);
        }

        $from = trim((string) ($_GET['from'] ?? '')) ?: null;
        $to = trim((string) ($_GET['to'] ?? '')) ?: null;

        $roles = $this->fetchAll('SELECT role, user_id FROM user_roles');
        $programs = $this->fetchAll('SELECT id, title, status, trainer_id, cost_amount FROM training_programs');
        $enrollments = $this->filterByDateRange(
            $this->fetchAll('SELECT program_id, status, enrolled_at FROM enrollments'),
            'enrolled_at',
            $from,
            $to
        );
        $certificates = $this->filterByDateRange(
            $this->fetchAll('SELECT id, issued_at FROM certificates'),
            'issued_at',
            $from,
            $to
        );
        $assessments = $this->fetchAll('SELECT id, program_id FROM assessments');
        $attempts = $this->filterByDateRange(
            $this->fetchAll('SELECT id, passed, assessment_id, completed_at FROM assessment_attempts'),
            'completed_at',
            $from,
            $to
        );
        $profiles = $this->fetchAll('SELECT user_id, full_name, email FROM profiles');
        $payments = $this->filterByDateRange(
            $this->fetchAll('SELECT program_id, amount, status, created_at FROM payments'),
            'created_at',
            $from,
            $to
        );

        $stats = [
            'totalTrainees' => $this->countByValue($roles, 'role', 'trainee'),
            'totalTrainers' => $this->countByValue($roles, 'role', 'trainer'),
            'totalPrograms' => count($programs),
            'activePrograms' => $this->countByValue($programs, 'status', 'active'),
            'totalEnrollments' => count($enrollments),
            'approvedEnrollments' => $this->countByValue($enrollments, 'status', 'approved'),
            'totalCertificates' => count($certificates),
            'totalAssessments' => count($assessments),
            'totalAttempts' => count($attempts),
            'passedAttempts' => count(array_filter(
                $attempts,
                static fn (array $attempt): bool => (bool) ($attempt['passed'] ?? false)
            )),
        ];

        $successfulPayments = array_values(array_filter(
            $payments,
            static fn (array $payment): bool => ($payment['status'] ?? '') === 'successful'
        ));
        $totalRevenue = array_reduce(
            $successfulPayments,
            static fn (float $sum, array $payment): float => $sum + (float) ($payment['amount'] ?? 0),
            0.0
        );

        $successfulProgramIds = array_values(array_unique(array_filter(array_map(
            static fn (array $payment): ?string => ($payment['program_id'] ?? null) ?: null,
            $successfulPayments
        ))));

        $programCostMap = [];
        foreach ($programs as $program) {
            $programCostMap[(string) $program['id']] = (float) ($program['cost_amount'] ?? 0);
        }

        $totalCost = 0.0;
        foreach ($successfulProgramIds as $programId) {
            $totalCost += $programCostMap[$programId] ?? 0.0;
        }

        $revenueByProgram = [];
        foreach ($successfulPayments as $payment) {
            $programId = (string) ($payment['program_id'] ?? '');
            if ($programId === '') {
                continue;
            }

            $revenueByProgram[$programId] = ($revenueByProgram[$programId] ?? 0.0) + (float) ($payment['amount'] ?? 0);
        }

        $programFinancials = [];
        foreach ($programs as $program) {
            $programId = (string) ($program['id'] ?? '');
            $revenue = (float) ($revenueByProgram[$programId] ?? 0.0);
            if ($revenue <= 0) {
                continue;
            }

            $cost = (float) ($program['cost_amount'] ?? 0.0);
            $programFinancials[] = [
                'name' => $this->truncateLabel((string) ($program['title'] ?? 'Unknown')),
                'revenue' => $revenue,
                'cost' => $cost,
                'profit' => $revenue - $cost,
            ];
        }

        usort(
            $programFinancials,
            static fn (array $left, array $right): int => $right['profit'] <=> $left['profit']
        );
        $programFinancials = array_slice($programFinancials, 0, 8);

        $programMap = [];
        foreach ($programs as $program) {
            $programMap[(string) $program['id']] = [
                'title' => (string) ($program['title'] ?? 'Unknown'),
                'trainer_id' => (string) ($program['trainer_id'] ?? ''),
                'enrolled' => 0,
                'approved' => 0,
            ];
        }

        foreach ($enrollments as $enrollment) {
            $programId = (string) ($enrollment['program_id'] ?? '');
            if (!isset($programMap[$programId])) {
                continue;
            }

            $programMap[$programId]['enrolled']++;
            if (($enrollment['status'] ?? '') === 'approved') {
                $programMap[$programId]['approved']++;
            }
        }

        $programEnrollments = [];
        foreach ($programMap as $program) {
            if (($program['enrolled'] ?? 0) <= 0) {
                continue;
            }

            $programEnrollments[] = [
                'name' => $this->truncateLabel((string) $program['title']),
                'enrolled' => (int) $program['enrolled'],
                'approved' => (int) $program['approved'],
            ];
        }
        $programEnrollments = array_slice($programEnrollments, 0, 8);

        $statusCounts = [];
        foreach ($enrollments as $enrollment) {
            $status = (string) ($enrollment['status'] ?? 'unknown');
            $statusCounts[$status] = ($statusCounts[$status] ?? 0) + 1;
        }
        $enrollmentStatusData = [];
        foreach ($statusCounts as $status => $count) {
            $enrollmentStatusData[] = [
                'name' => ucfirst($status),
                'value' => $count,
            ];
        }

        $passedAttempts = count(array_filter(
            $attempts,
            static fn (array $attempt): bool => (bool) ($attempt['passed'] ?? false)
        ));
        $failedAttempts = count(array_filter(
            $attempts,
            static fn (array $attempt): bool => array_key_exists('passed', $attempt) && (bool) $attempt['passed'] === false
        ));
        $assessmentData = [];
        if ($passedAttempts + $failedAttempts > 0) {
            $assessmentData[] = ['name' => 'Passed', 'value' => $passedAttempts];
            $assessmentData[] = ['name' => 'Failed', 'value' => $failedAttempts];
        }

        $profileMap = [];
        foreach ($profiles as $profile) {
            $profileMap[(string) $profile['user_id']] = [
                'full_name' => $profile['full_name'] ?? null,
                'email' => $profile['email'] ?? null,
            ];
        }

        $assessmentIdsByProgram = [];
        foreach ($assessments as $assessment) {
            $programId = (string) ($assessment['program_id'] ?? '');
            $assessmentIdsByProgram[$programId] ??= [];
            $assessmentIdsByProgram[$programId][] = (string) ($assessment['id'] ?? '');
        }

        $attemptsByAssessment = [];
        foreach ($attempts as $attempt) {
            $assessmentId = (string) ($attempt['assessment_id'] ?? '');
            $attemptsByAssessment[$assessmentId][] = $attempt;
        }

        $trainerIds = array_values(array_unique(array_filter(array_map(
            static fn (array $program): ?string => ($program['trainer_id'] ?? null) ?: null,
            $programs
        ))));

        $trainerMetrics = [];
        foreach ($trainerIds as $trainerId) {
            $trainerPrograms = array_values(array_filter(
                $programs,
                static fn (array $program): bool => ($program['trainer_id'] ?? '') === $trainerId
            ));
            $trainerProgramIds = array_map(
                static fn (array $program): string => (string) $program['id'],
                $trainerPrograms
            );

            $approvedEnrollmentCount = count(array_filter(
                $enrollments,
                static fn (array $enrollment): bool => in_array($enrollment['program_id'] ?? '', $trainerProgramIds, true)
                    && ($enrollment['status'] ?? '') === 'approved'
            ));

            $trainerAssessmentIds = [];
            foreach ($trainerProgramIds as $programId) {
                foreach ($assessmentIdsByProgram[$programId] ?? [] as $assessmentId) {
                    $trainerAssessmentIds[] = $assessmentId;
                }
            }

            $trainerAttempts = [];
            foreach ($trainerAssessmentIds as $assessmentId) {
                foreach ($attemptsByAssessment[$assessmentId] ?? [] as $attempt) {
                    $trainerAttempts[] = $attempt;
                }
            }

            $trainerPassed = count(array_filter(
                $trainerAttempts,
                static fn (array $attempt): bool => (bool) ($attempt['passed'] ?? false)
            ));
            $passRate = count($trainerAttempts) > 0
                ? (int) round(($trainerPassed / count($trainerAttempts)) * 100)
                : 0;

            $profile = $profileMap[$trainerId] ?? ['full_name' => null, 'email' => null];
            $trainerMetrics[] = [
                'name' => (string) ($profile['full_name'] ?: $profile['email'] ?: 'Unknown'),
                'programs' => count($trainerPrograms),
                'trainees' => $approvedEnrollmentCount,
                'passRate' => $passRate,
            ];
        }

        Response::json([
            'stats' => $stats,
            'programEnrollments' => $programEnrollments,
            'enrollmentStatusData' => $enrollmentStatusData,
            'assessmentData' => $assessmentData,
            'trainerMetrics' => $trainerMetrics,
            'totalRevenue' => $totalRevenue,
            'totalCost' => $totalCost,
            'totalProfit' => $totalRevenue - $totalCost,
            'programFinancials' => $programFinancials,
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetchAll(string $sql): array
    {
        $statement = $this->pdo->query($sql);
        return $statement->fetchAll();
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function filterByDateRange(array $rows, string $field, ?string $from, ?string $to): array
    {
        return array_values(array_filter($rows, static function (array $row) use ($field, $from, $to): bool {
            $value = (string) ($row[$field] ?? '');

            if ($value === '') {
                return true;
            }

            if ($from !== null && $value < $from) {
                return false;
            }

            if ($to !== null && $value > $to . 'T23:59:59') {
                return false;
            }

            return true;
        }));
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     */
    private function countByValue(array $rows, string $field, string $value): int
    {
        return count(array_filter(
            $rows,
            static fn (array $row): bool => (string) ($row[$field] ?? '') === $value
        ));
    }

    private function truncateLabel(string $value, int $limit = 20): string
    {
        if (strlen($value) <= $limit) {
            return $value;
        }

        return substr($value, 0, $limit) . '...';
    }
}
