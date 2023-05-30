CREATE TABLE `transfer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token_id` int NOT NULL,
  `token_contract` varchar(42) NOT NULL,
  `recipient_address` varchar(42) NOT NULL,
  `txn_id` varchar(66) DEFAULT NULL,
  `status` char(15) DEFAULT 'PENDING' NOT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
