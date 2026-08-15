DELETE FROM `item_rarity`;

INSERT INTO `item_rarity` (`id`, `code`, `display_name_zh`, `display_name_en`, `sort_order`, `status`, `deleted`)
VALUES
  (-13, 'master', '大师', 'Master', 1, 1, 0),
  (-12, 'expert', '专家', 'Expert', 2, 1, 0),
  (-11, 'quest', '任务', 'Quest', 3, 1, 0),
  (-1, 'gray', '灰色', 'Gray', 4, 1, 0),
  (0, 'white', '白色', 'White', 5, 1, 0),
  (1, 'blue', '蓝色', 'Blue', 6, 1, 0),
  (2, 'green', '绿色', 'Green', 7, 1, 0),
  (3, 'orange', '橙色', 'Orange', 8, 1, 0),
  (4, 'light_red', '浅红色', 'Light Red', 9, 1, 0),
  (5, 'pink', '粉红色', 'Pink', 10, 1, 0),
  (6, 'light_purple', '浅紫色', 'Light Purple', 11, 1, 0),
  (7, 'lime', '黄绿色', 'Lime', 12, 1, 0),
  (8, 'yellow', '黄色', 'Yellow', 13, 1, 0),
  (9, 'cyan', '青色', 'Cyan', 14, 1, 0),
  (10, 'red', '红色', 'Red', 15, 1, 0),
  (11, 'purple', '紫色', 'Purple', 16, 1, 0);
