CREATE TABLE `subscription` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `subscriber_id` int NOT NULL,
  `email_import_id` int DEFAULT NULL,
  `start_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `end_date` datetime DEFAULT NULL,
  `active` boolean DEFAULT TRUE,
  PRIMARY KEY (`id`),
  KEY `app_id` (`app_id`),
  UNIQUE KEY `single_active_sub` (`subscriber_id`, `app_id`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
