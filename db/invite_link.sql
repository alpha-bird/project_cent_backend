CREATE TABLE `invite_link` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` INT DEFAULT NULL,
  `code` varchar(36) NOT NULL,
  `signup_limit` INT DEFAULT NULL,
  `is_expired` boolean DEFAULT FALSE,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
