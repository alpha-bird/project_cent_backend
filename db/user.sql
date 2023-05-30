CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` INT DEFAULT NULL,
  `display_name` varchar(50) DEFAULT NULL,
  `email_address` varchar(50) NOT NULL,
  `wallet_address` varchar(42) DEFAULT NULL,
  `stripe_id` varchar(42) DEFAULT NULL,
  `stripe_customer_id` varchar(42) DEFAULT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `terms_conditions_accepted_date` datetime DEFAULT NULL,
  `daily_digest_subscribe` boolean DEFAULT TRUE,
  `status` char(4) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_address` (`email_address`),
  KEY `app_id` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
