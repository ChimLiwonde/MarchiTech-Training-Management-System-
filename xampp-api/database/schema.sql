CREATE DATABASE IF NOT EXISTS marchitech_training
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE marchitech_training;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  email VARCHAR(191) NOT NULL,
  full_name VARCHAR(191) DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role ENUM('admin', 'trainer', 'trainee') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_roles_user_role (user_id, role),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_api_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_programs (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  description TEXT DEFAULT NULL,
  trainer_id CHAR(36) NOT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  max_trainees INT DEFAULT 30,
  fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  cost_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'MWK',
  status ENUM('draft', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_training_programs_trainer
    FOREIGN KEY (trainer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enrollments (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  trainee_id CHAR(36) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'completed', 'withdrawn') NOT NULL DEFAULT 'pending',
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollments_program_trainee (program_id, trainee_id),
  CONSTRAINT fk_enrollments_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_trainee
    FOREIGN KEY (trainee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  session_date DATE NOT NULL,
  start_time TIME DEFAULT NULL,
  end_time TIME DEFAULT NULL,
  location VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  trainee_id CHAR(36) NOT NULL,
  status ENUM('present', 'late', 'absent', 'excused') NOT NULL DEFAULT 'absent',
  checked_in_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_session_trainee (session_id, trainee_id),
  CONSTRAINT fk_attendance_session
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_trainee
    FOREIGN KEY (trainee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_resources (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT DEFAULT NULL,
  file_url TEXT DEFAULT NULL,
  file_type VARCHAR(50) DEFAULT NULL,
  external_url TEXT DEFAULT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_training_resources_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_training_resources_user
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessments (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT DEFAULT NULL,
  passing_score INT NOT NULL DEFAULT 70,
  time_limit_minutes INT DEFAULT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessments_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessments_user
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_questions (
  id CHAR(36) PRIMARY KEY,
  assessment_id CHAR(36) NOT NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) NOT NULL DEFAULT 'multiple_choice',
  options JSON NOT NULL,
  correct_answer TEXT NOT NULL,
  points INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessment_questions_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id CHAR(36) PRIMARY KEY,
  assessment_id CHAR(36) NOT NULL,
  trainee_id CHAR(36) NOT NULL,
  answers JSON NOT NULL,
  score INT DEFAULT NULL,
  passed TINYINT(1) DEFAULT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessment_attempts_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessment_attempts_trainee
    FOREIGN KEY (trainee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS program_reviews (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  trainee_id CHAR(36) NOT NULL,
  rating INT NOT NULL,
  comment TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_program_reviews_program_trainee (program_id, trainee_id),
  CONSTRAINT fk_program_reviews_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_reviews_trainee
    FOREIGN KEY (trainee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificates (
  id CHAR(36) PRIMARY KEY,
  trainee_id CHAR(36) NOT NULL,
  program_id CHAR(36) NOT NULL,
  assessment_id CHAR(36) DEFAULT NULL,
  attempt_id CHAR(36) DEFAULT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  certificate_number VARCHAR(64) NOT NULL UNIQUE,
  issued_by CHAR(36) NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificates_trainee
    FOREIGN KEY (trainee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL,
  CONSTRAINT fk_certificates_attempt
    FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  CONSTRAINT fk_certificates_issuer
    FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(191) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  link VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  trainee_id CHAR(36) NOT NULL,
  program_id CHAR(36) NOT NULL,
  enrollment_id CHAR(36) DEFAULT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'paychangu',
  provider_reference VARCHAR(191) DEFAULT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'MWK',
  status ENUM('pending', 'successful', 'failed', 'cancelled') NOT NULL,
  raw_payload JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_program_trainee (program_id, trainee_id),
  CONSTRAINT fk_payments_trainee
    FOREIGN KEY (trainee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_program
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_enrollment
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_training_programs_status ON training_programs(status);
CREATE INDEX idx_sessions_program_id ON sessions(program_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_payments_status ON payments(status);

