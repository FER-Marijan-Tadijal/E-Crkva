#include "audio.h"

#include "driver/i2s_std.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <math.h>
#include <string.h>

#define BCLK_PIN 6
#define WS_PIN 7
#define DOUT_PIN 4
#define DIN_PIN 5
#define SAMPLE_RATE 16000
#define BUF_SAMPLES 512
#define AMPLITUDE 0.3f

static const char *TAG = "audio";

static i2s_chan_handle_t s_tx;
static i2s_chan_handle_t s_rx;
static float s_cal_db = 0.0f;
static volatile bool s_playing = false;

// razliciti globalni buf za TX i RX
static int32_t s_tx_buf[BUF_SAMPLES];
static int32_t s_rx_buf[BUF_SAMPLES];

// tone f 1-4 (index 0 nekoristen)
static const float FREQS[] = {0.0f, 246.0f, 329.0f, 370.0f, 415.0f};

void audio_init(void) {
   i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
   ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, &s_tx, &s_rx));

   i2s_std_config_t cfg = {
       .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
       .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
       .gpio_cfg = {
           .mclk = I2S_GPIO_UNUSED,
           .bclk = BCLK_PIN,
           .ws = WS_PIN,
           .dout = DOUT_PIN,
           .din = DIN_PIN,
       },
   };

   ESP_ERROR_CHECK(i2s_channel_init_std_mode(s_tx, &cfg));
   ESP_ERROR_CHECK(i2s_channel_init_std_mode(s_rx, &cfg));
   ESP_ERROR_CHECK(i2s_channel_enable(s_tx));
   ESP_ERROR_CHECK(i2s_channel_enable(s_rx));

   ESP_LOGI(TAG, "Audio OK (BCLK=%d WS=%d DOUT=%d DIN=%d)", BCLK_PIN, WS_PIN, DOUT_PIN, DIN_PIN);
}

void audio_play_tone(int tone_num, int duration_ms) {
   if (tone_num < 1 || tone_num > 4) return;

   float freq = FREQS[tone_num];
   int total = (SAMPLE_RATE * duration_ms) / 1000;
   float phase = 0.0f;
   float inc = 2.0f * (float)M_PI * freq / SAMPLE_RATE;
   int done = 0;

   s_playing = true;
   while (done < total) {
      int n = total - done;
      if (n > BUF_SAMPLES) n = BUF_SAMPLES;

      for (int i = 0; i < n; i++) {
         s_tx_buf[i] = (int32_t)(AMPLITUDE * (float)INT32_MAX * sinf(phase));
         phase += inc;
         if (phase >= 2.0f * (float)M_PI) phase -= 2.0f * (float)M_PI;
      }

      size_t wr = 0;
      i2s_channel_write(s_tx, s_tx_buf, n * sizeof(int32_t), &wr, portMAX_DELAY);
      done += (int)(wr / sizeof(int32_t));
   }
   s_playing = false;
}

void audio_play_silence(int duration_ms) {
   int total = (SAMPLE_RATE * duration_ms) / 1000;
   memset(s_tx_buf, 0, sizeof(s_tx_buf));
   int done = 0;

   s_playing = true;
   while (done < total) {
      int n = total - done;
      if (n > BUF_SAMPLES) n = BUF_SAMPLES;
      size_t wr = 0;
      i2s_channel_write(s_tx, s_tx_buf, n * sizeof(int32_t), &wr, portMAX_DELAY);
      done += (int)(wr / sizeof(int32_t));
   }
   s_playing = false;
}

float audio_measure_db(void) {
   int total = SAMPLE_RATE; // 1s
   double sum_sq = 0.0;
   int n_tot = 0;

   while (n_tot < total) {
      int n = total - n_tot;
      if (n > BUF_SAMPLES) n = BUF_SAMPLES;

      size_t rd = 0;
      i2s_channel_read(s_rx, s_rx_buf, n * sizeof(int32_t), &rd, portMAX_DELAY);
      int got = (int)(rd / sizeof(int32_t));

      for (int i = 0; i < got; i++) {
         // ICS-43434 outputs 24-bit data in upper bits of 32-bit word
         float v = (float)(s_rx_buf[i] >> 8) / (float)(1 << 23);
         sum_sq += (double)(v * v);
      }
      n_tot += got;
   }

   float rms = sqrtf((float)(sum_sq / n_tot));
   if (rms < 1e-10f) rms = 1e-10f;
   return 20.0f * log10f(rms) - s_cal_db;
}

void audio_calibrate(void) {
   ESP_LOGI(TAG, "Kalibracija (1s tisine)...");
   s_cal_db = 0.0f;
   s_cal_db = audio_measure_db();
   ESP_LOGI(TAG, "Kalibracija zavrsena, referenca: %.2f dB", s_cal_db);
}

bool audio_is_playing(void) {
   return s_playing;
}
