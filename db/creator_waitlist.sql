CREATE TABLE `creator_waitlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email_address` varchar(50) NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` char(4) DEFAULT 'PEND' NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_address` (`email_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
