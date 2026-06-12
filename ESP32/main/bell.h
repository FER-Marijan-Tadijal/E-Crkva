#pragma once

#include <stdint.h>

// min: 0, 15, 30, 45 — h: 0-23
void bell_play_pattern(int minute, int hour);
void bell_ring(int tone_num);

// seq: tonovi 1-4 i 0 (pauza), len ne ukljucuje terminator (-1)
void bell_set_pattern(int minute, const int8_t *seq, int len);
void bell_reset_patterns(void);
