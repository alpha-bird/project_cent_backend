CREATE TABLE `email_campaign` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `post_id` int NOT NULL,
  `sub_total` INT DEFAULT 0,
  `send_total` int DEFAULT '0',
  `send_date` datetime DEFAULT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` char(4) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `post_id` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
