CREATE TABLE `invite_link_signup` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `app_id` INT NOT NULL,
  `link_id` INT NOT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `link_id` (`link_id`),
  KEY `app_id` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
