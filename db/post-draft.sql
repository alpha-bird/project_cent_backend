CREATE TABLE `post_draft` (
  `uuid` varchar(36) NOT NULL,
  `app_id` int NOT NULL,
  `creator_id` int NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `body` text DEFAULT NULL,
  `styled_html` text DEFAULT NULL,
  `status` char(4) NOT NULL DEFAULT 'DFLT',
  `create_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`uuid`),
  KEY `app_id` (`app_id`),
  KEY `creator_id` (`creator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
