CREATE TABLE `app_origin` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_id` int NOT NULL,
  `origin` varchar(500) NOT NULL,
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `single_app_per_origin` (`origin`),
  KEY `app_id` (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
