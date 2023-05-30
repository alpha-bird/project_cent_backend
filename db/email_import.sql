CREATE TABLE `email_import` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `email_total` INT DEFAULT 0,
  `subscription_total` INT DEFAULT 0,
  `auto_notify` boolean DEFAULT FALSE,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` char(4) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `app_id` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
