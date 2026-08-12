INSERT INTO wa_bad_words
  (group_jid, pattern, normalized_pattern, match_type, severity, enabled, exceptions_json)
SELECT NULL, 'pendej', 'pendej', 'phrase', 'moderada', 1, JSON_ARRAY()
WHERE NOT EXISTS (
  SELECT 1 FROM wa_bad_words
   WHERE group_jid IS NULL
     AND normalized_pattern = 'pendej'
     AND match_type = 'phrase'
);

INSERT INTO wa_bad_words
  (group_jid, pattern, normalized_pattern, match_type, severity, enabled, exceptions_json)
SELECT NULL, 'idiota', 'idiota', 'word_boundary', 'moderada', 1, JSON_ARRAY()
WHERE NOT EXISTS (
  SELECT 1 FROM wa_bad_words
   WHERE group_jid IS NULL
     AND normalized_pattern = 'idiota'
     AND match_type = 'word_boundary'
);

INSERT INTO wa_bad_words
  (group_jid, pattern, normalized_pattern, match_type, severity, enabled, exceptions_json)
SELECT NULL, 'imbecil', 'imbecil', 'word_boundary', 'moderada', 1, JSON_ARRAY()
WHERE NOT EXISTS (
  SELECT 1 FROM wa_bad_words
   WHERE group_jid IS NULL
     AND normalized_pattern = 'imbecil'
     AND match_type = 'word_boundary'
);

INSERT INTO wa_bad_words
  (group_jid, pattern, normalized_pattern, match_type, severity, enabled, exceptions_json)
SELECT NULL, 'estupid', 'estupid', 'phrase', 'moderada', 1, JSON_ARRAY()
WHERE NOT EXISTS (
  SELECT 1 FROM wa_bad_words
   WHERE group_jid IS NULL
     AND normalized_pattern = 'estupid'
     AND match_type = 'phrase'
);

