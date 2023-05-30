CREATE TABLE `link` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `url` varchar(2048) NOT NULL,
  `image` varchar(2048) DEFAULT NULL,
  `deleted` tinyint(1) DEFAULT '0',
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `app_id` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
