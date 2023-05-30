CREATE TABLE `payout` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `creator_id` int NOT NULL,
  `payout_id` varchar(66) NOT NULL,
  `amount` int NOT NULL,
  `currency` varchar(50) NOT NULL,
  `is_automatic` boolean DEFAULT TRUE,
  `status` varchar(50) NOT NULL,
  `created_date` datetime NOT NULL,
  `arrival_date` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `creator_id` (`creator_id`),
  KEY `payout_id` (`payout_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
