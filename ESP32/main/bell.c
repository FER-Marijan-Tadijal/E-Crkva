#include "bell.h"
#include "audio.h"
#include "esp_log.h"
#include <string.h>

#define TONE_MS 500
#define PAUSE_MS 500
#define MAX_PATTERN_LEN 64

static const char *TAG = "bell";

static const int8_t P15_def[] = {4, 3, 2, 1, -1};
static const int8_t P30_def[] = {2, 4, 3, 1, 0, 2, 3, 4, 2, -1};
static const int8_t P45_def[] = {4, 2, 3, 1, 0, 1, 3, 4, 2, 0, 4, 3, 2, 1, -1};
static const int8_t P00_def[] = {2, 4, 3, 1, 0, 2, 3, 4, 2, 0, 4, 2, 3, 1, 0, 2, 3, 4, 2, 0, -1};

static int8_t s_p15[MAX_PATTERN_LEN];
static int8_t s_p30[MAX_PATTERN_LEN];
static int8_t s_p45[MAX_PATTERN_LEN];
static int8_t s_p00[MAX_PATTERN_LEN];

static void copy_default(int8_t *dst, const int8_t *src) {
   int i = 0;
   while (src[i] != -1) {
      dst[i] = src[i];
      i++;
   }
   dst[i] = -1;
}

void bell_reset_patterns(void) {
   copy_default(s_p15, P15_def);
   copy_default(s_p30, P30_def);
   copy_default(s_p45, P45_def);
   copy_default(s_p00, P00_def);
   ESP_LOGI(TAG, "Obrasci resetirani na zadane");
}

void bell_set_pattern(int minute, const int8_t *seq, int len) {
   int8_t *dst;
   switch (minute) {
   case 15:
      dst = s_p15;
      break;
   case 30:
      dst = s_p30;
      break;
   case 45:
      dst = s_p45;
      break;
   case 0:
      dst = s_p00;
      break;
   default:
      ESP_LOGW(TAG, "Nepoznati slot za pattern: %d", minute);
      return;
   }
   if (len >= MAX_PATTERN_LEN) len = MAX_PATTERN_LEN - 1;
   memcpy(dst, seq, len);
   dst[len] = -1;
   ESP_LOGI(TAG, "Pattern %d postavljen (%d tonova)", minute, len);
}

static void play_sequence(const int8_t *seq) {
   for (int i = 0; seq[i] != -1; i++) {
      if (seq[i] == 0) {
         audio_play_silence(PAUSE_MS);
      } else {
         audio_play_tone(seq[i], TONE_MS);
      }
   }
}

void bell_ring(int tone_num) {
   ESP_LOGI(TAG, "Zvono %d", tone_num);
   audio_play_tone(tone_num, TONE_MS);
}

void bell_play_pattern(int minute, int hour) {
   ESP_LOGI(TAG, "Zvonjenje %02d:%02d", hour, minute);

   switch (minute) {
   case 15:
      play_sequence(s_p15);
      break;
   case 30:
      play_sequence(s_p30);
      break;
   case 45:
      play_sequence(s_p45);
      break;
   case 0: {
      play_sequence(s_p00);
      // S = onoliko tona 1 koliko je sati (12-satni format)
      int h = hour % 12;
      if (h == 0) h = 12;
      for (int i = 0; i < h; i++) {
         audio_play_tone(1, TONE_MS);
         if (i < h - 1) audio_play_silence(PAUSE_MS);
      }
      break;
   }
   default:
      ESP_LOGW(TAG, "Nepoznati minute slot: %d", minute);
      break;
   }
}
