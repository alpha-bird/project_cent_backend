CREATE TABLE `token` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `creator_id` int NOT NULL,
  `recipient_id` int NOT NULL,
  `source_type` varchar(20) NOT NULL,
  `source_id` int NOT NULL,
  `contract_address` varchar(42) DEFAULT NULL,
  `purchase_id` int DEFAULT NULL,
  `transfer_id` int DEFAULT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `create_txid` varchar(66) DEFAULT NULL,
  `minted` boolean DEFAULT FALSE,
  `mint_check_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `ip` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `creator_id` (`creator_id`),
  KEY `recipient_id` (`recipient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
