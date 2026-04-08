<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/Response.php';
require_once __DIR__ . '/src/Request.php';
require_once __DIR__ . '/src/Auth.php';
require_once __DIR__ . '/src/NotificationService.php';
require_once __DIR__ . '/src/Controllers/AuthController.php';
require_once __DIR__ . '/src/Controllers/AssessmentController.php';
require_once __DIR__ . '/src/Controllers/CertificateController.php';
require_once __DIR__ . '/src/Controllers/FeedbackController.php';
require_once __DIR__ . '/src/Controllers/NotificationController.php';
require_once __DIR__ . '/src/Controllers/PaymentController.php';
require_once __DIR__ . '/src/Controllers/EnrollmentController.php';
require_once __DIR__ . '/src/Controllers/ProfileController.php';
require_once __DIR__ . '/src/Controllers/ProgressController.php';
require_once __DIR__ . '/src/Controllers/ReportController.php';
require_once __DIR__ . '/src/Controllers/ResourceController.php';
require_once __DIR__ . '/src/Controllers/TrainingProgramController.php';
require_once __DIR__ . '/src/Controllers/SessionController.php';
require_once __DIR__ . '/src/Controllers/AttendanceController.php';
require_once __DIR__ . '/src/Controllers/DashboardController.php';
require_once __DIR__ . '/src/Controllers/UserManagementController.php';

use MarchiTech\Api\Auth;
use MarchiTech\Api\Controllers\AssessmentController;
use MarchiTech\Api\Controllers\AttendanceController;
use MarchiTech\Api\Controllers\AuthController;
use MarchiTech\Api\Controllers\CertificateController;
use MarchiTech\Api\Controllers\DashboardController;
use MarchiTech\Api\Controllers\EnrollmentController;
use MarchiTech\Api\Controllers\FeedbackController;
use MarchiTech\Api\Controllers\NotificationController;
use MarchiTech\Api\Controllers\PaymentController;
use MarchiTech\Api\Controllers\ProfileController;
use MarchiTech\Api\Controllers\ProgressController;
use MarchiTech\Api\Controllers\ReportController;
use MarchiTech\Api\Controllers\ResourceController;
use MarchiTech\Api\Controllers\SessionController;
use MarchiTech\Api\Controllers\TrainingProgramController;
use MarchiTech\Api\Controllers\UserManagementController;
use MarchiTech\Api\Database;
use MarchiTech\Api\NotificationService;
use MarchiTech\Api\Response;

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = $config['cors']['allowed_origins'] ?? [];

if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
}

header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$database = new Database($config['db']);
$pdo = $database->pdo();
$auth = new Auth($pdo);
$notificationService = new NotificationService($pdo);

$authController = new AuthController($pdo, $auth);
$assessmentController = new AssessmentController($pdo, $auth);
$certificateController = new CertificateController($pdo, $auth);
$enrollmentController = new EnrollmentController($pdo, $auth, $notificationService, (bool) ($config['payments']['enabled'] ?? false));
$feedbackController = new FeedbackController($pdo, $auth);
$notificationController = new NotificationController($pdo, $auth);
$paymentController = new PaymentController($pdo, $auth, $notificationService, $config['payments'] ?? []);
$profileController = new ProfileController($pdo, $auth);
$progressController = new ProgressController($pdo, $auth);
$trainingController = new TrainingProgramController($pdo, $auth);
$sessionController = new SessionController($pdo, $auth);
$attendanceController = new AttendanceController($pdo, $auth);
$dashboardController = new DashboardController($pdo, $auth);
$resourceController = new ResourceController($pdo, $auth);
$reportController = new ReportController($pdo, $auth);
$userManagementController = new UserManagementController($pdo, $auth);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

if ($basePath !== '' && $basePath !== '/' && str_starts_with($path, $basePath)) {
    $path = substr($path, strlen($basePath));
}

if ($path === '' || $path === false) {
    $path = '/';
}

if (str_starts_with($path, '/index.php')) {
    $path = substr($path, strlen('/index.php')) ?: '/';
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET' && $path === '/') {
        Response::json([
            'name' => 'M\'archiTech XAMPP API',
            'status' => 'ok',
            'message' => 'PHP/MySQL migration scaffold is running.',
        ]);
    }

    if ($method === 'GET' && $path === '/health') {
        Response::json([
            'status' => 'ok',
            'database' => 'connected',
            'timestamp' => gmdate(DATE_ATOM),
        ]);
    }

    if ($method === 'GET' && $path === '/settings/public') {
        $paymentsConfigured = (bool) ($config['payments']['enabled'] ?? false)
            && trim((string) ($config['payments']['paychangu']['secret_key'] ?? '')) !== '';

        Response::json([
            'payments_enabled' => $paymentsConfigured,
            'payment_provider' => $paymentsConfigured ? ($config['payments']['provider'] ?? 'paychangu') : null,
        ]);
    }

    if ($method === 'GET' && $path === '/dashboard') {
        $dashboardController->overview();
    }

    if ($method === 'GET' && $path === '/reports') {
        $reportController->overview();
    }

    if ($method === 'GET' && $path === '/progress') {
        $progressController->overview();
    }

    if ($method === 'GET' && $path === '/profile') {
        $profileController->show();
    }

    if ($method === 'PATCH' && $path === '/profile') {
        $profileController->update();
    }

    if ($method === 'GET' && $path === '/feedback') {
        $feedbackController->index();
    }

    if ($method === 'POST' && $path === '/feedback') {
        $feedbackController->create();
    }

    if ($method === 'PATCH' && preg_match('#^/feedback/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $feedbackController->update($matches[1]);
    }

    if ($method === 'DELETE' && preg_match('#^/feedback/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $feedbackController->delete($matches[1]);
    }

    if ($method === 'GET' && $path === '/users') {
        $userManagementController->index();
    }

    if ($method === 'PATCH' && preg_match('#^/users/([a-f0-9-]+)/role$#i', $path, $matches) === 1) {
        $userManagementController->updateRole($matches[1]);
    }

    if ($method === 'GET' && $path === '/notifications') {
        $notificationController->index();
    }

    if ($method === 'PATCH' && $path === '/notifications/read-all') {
        $notificationController->markAllRead();
    }

    if ($method === 'PATCH' && preg_match('#^/notifications/([a-f0-9-]+)/read$#i', $path, $matches) === 1) {
        $notificationController->markRead($matches[1]);
    }

    if ($method === 'DELETE' && preg_match('#^/notifications/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $notificationController->delete($matches[1]);
    }

    if ($method === 'GET' && $path === '/payments/my') {
        $paymentController->myPayments();
    }

    if ($method === 'POST' && $path === '/payments/checkout') {
        $paymentController->initiateCheckout();
    }

    if ($method === 'POST' && $path === '/payments/verify') {
        $paymentController->verify();
    }

    if ($method === 'POST' && $path === '/payments/paychangu/webhook') {
        $paymentController->handleWebhook();
    }

    if ($method === 'GET' && $path === '/certificates/verify') {
        $certificateController->verifyPublic();
    }

    if ($method === 'POST' && $path === '/auth/register') {
        $authController->register();
    }

    if ($method === 'POST' && $path === '/auth/login') {
        $authController->login();
    }

    if ($method === 'GET' && $path === '/auth/me') {
        $authController->me();
    }

    if ($method === 'POST' && $path === '/auth/logout') {
        $authController->logout();
    }

    if ($method === 'GET' && $path === '/training-programs') {
        $trainingController->index();
    }

    if ($method === 'POST' && $path === '/training-programs') {
        $trainingController->create();
    }

    if ($method === 'PATCH' && preg_match('#^/training-programs/([a-f0-9-]+)/status$#i', $path, $matches) === 1) {
        $trainingController->updateStatus($matches[1]);
    }

    if ($method === 'GET' && $path === '/assessments') {
        $assessmentController->index();
    }

    if ($method === 'POST' && $path === '/assessments') {
        $assessmentController->create();
    }

    if ($method === 'PATCH' && preg_match('#^/assessments/([a-f0-9-]+)/publish$#i', $path, $matches) === 1) {
        $assessmentController->updatePublish($matches[1]);
    }

    if ($method === 'DELETE' && preg_match('#^/assessments/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $assessmentController->delete($matches[1]);
    }

    if ($method === 'GET' && preg_match('#^/assessments/([a-f0-9-]+)/questions$#i', $path, $matches) === 1) {
        $assessmentController->questions($matches[1]);
    }

    if ($method === 'POST' && preg_match('#^/assessments/([a-f0-9-]+)/questions$#i', $path, $matches) === 1) {
        $assessmentController->addQuestion($matches[1]);
    }

    if ($method === 'DELETE' && preg_match('#^/assessment-questions/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $assessmentController->deleteQuestion($matches[1]);
    }

    if ($method === 'POST' && preg_match('#^/assessments/([a-f0-9-]+)/attempts$#i', $path, $matches) === 1) {
        $assessmentController->submitAttempt($matches[1]);
    }

    if ($method === 'GET' && $path === '/certificates') {
        $certificateController->index();
    }

    if ($method === 'POST' && $path === '/certificates') {
        $certificateController->create();
    }

    if ($method === 'GET' && $path === '/resources') {
        $resourceController->index();
    }

    if ($method === 'POST' && $path === '/resources') {
        $resourceController->create();
    }

    if ($method === 'DELETE' && preg_match('#^/resources/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $resourceController->delete($matches[1]);
    }

    if ($method === 'GET' && $path === '/sessions') {
        $sessionController->index();
    }

    if ($method === 'POST' && $path === '/sessions') {
        $sessionController->create();
    }

    if ($method === 'DELETE' && preg_match('#^/sessions/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $sessionController->delete($matches[1]);
    }

    if ($method === 'GET' && preg_match('#^/sessions/([a-f0-9-]+)/attendance$#i', $path, $matches) === 1) {
        $attendanceController->index($matches[1]);
    }

    if ($method === 'POST' && preg_match('#^/sessions/([a-f0-9-]+)/attendance/initialize$#i', $path, $matches) === 1) {
        $attendanceController->initialize($matches[1]);
    }

    if ($method === 'PATCH' && preg_match('#^/attendance/([a-f0-9-]+)$#i', $path, $matches) === 1) {
        $attendanceController->update($matches[1]);
    }

    if ($method === 'POST' && preg_match('#^/attendance/([a-f0-9-]+)/check-in$#i', $path, $matches) === 1) {
        $attendanceController->selfCheckIn($matches[1]);
    }

    if ($method === 'POST' && preg_match('#^/training-programs/([a-f0-9-]+)/enroll$#i', $path, $matches) === 1) {
        $enrollmentController->enrollInProgram($matches[1]);
    }

    if ($method === 'GET' && $path === '/enrollments/my') {
        $enrollmentController->myEnrollments();
    }

    if ($method === 'GET' && preg_match('#^/training-programs/([a-f0-9-]+)/enrollments$#i', $path, $matches) === 1) {
        $enrollmentController->programEnrollments($matches[1]);
    }

    if ($method === 'PATCH' && preg_match('#^/enrollments/([a-f0-9-]+)/status$#i', $path, $matches) === 1) {
        $enrollmentController->updateStatus($matches[1]);
    }

    Response::json(['error' => 'Route not found', 'path' => $path], 404);
} catch (Throwable $exception) {
    Response::json([
        'error' => 'Server error',
        'message' => $exception->getMessage(),
    ], 500);
}
