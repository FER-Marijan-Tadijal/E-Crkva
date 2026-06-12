#pragma once

#include <stdbool.h>

void audio_init(void);
void audio_calibrate(void);
void audio_play_tone(int tone_num, int duration_ms);
void audio_play_silence(int duration_ms);
float audio_measure_db(void);
bool audio_is_playing(void);
