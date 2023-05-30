CREATE TABLE `collection` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `contract_address` varchar(42) DEFAULT NULL UNIQUE,
  `contract_uri` varchar(255) DEFAULT NULL UNIQUE,
  `creator_address` varchar(42) NOT NULL,
  `royalty_address` varchar(42) NOT NULL,
  `royalty_rate` int NOT NULL,
  `token_name` varchar(255) DEFAULT NULL,
  `token_symbol` varchar(255) DEFAULT NULL,
  `version` int NOT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
